/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { WeeklyLessonPlan, LessonPlanForm, SUBJECTS, CLASSES, LectureScript, PeriodPlan } from "../types";

// Constants
const MAX_CHAR_LIMIT = 150000; // Adjusted for safer token overhead
const DEFAULT_MODEL = "gemini-3-flash-preview"; 

function truncateString(str: string): string {
  if (str && str.length > MAX_CHAR_LIMIT) {
    return str.substring(0, MAX_CHAR_LIMIT) + "... [Content Truncated for AI Summary]";
  }
  return str || "";
}

export async function validateApiKey(key: string): Promise<{ valid: boolean; error?: string }> {
  if (!key || key.trim().length === 0) return { valid: false, error: "Key is empty" };
  
  // Format check
  if (!key.startsWith("AIzaSy")) {
    return { valid: false, error: "Invalid format: Gemini keys usually start with 'AIzaSy'" };
  }
  
  if (key.length < 35) {
    return { valid: false, error: "Invalid length: Key is too short" };
  }

  try {
    const genAI = new GoogleGenAI({ apiKey: key });
    // Minimal request to verify key functionality
    await genAI.models.generateContent({ 
      model: "gemini-1.5-flash", 
      contents: [{ role: "user", parts: [{ text: "hi" }] }] 
    });
    return { valid: true };
  } catch (err: any) {
    const msg = String(err?.message || "").toLowerCase();
    if (msg.includes("api_key_invalid") || msg.includes("invalid api key")) {
      return { valid: false, error: "This API Key is invalid or has been revoked." };
    }
    if (msg.includes("quota") || msg.includes("rate limit")) {
      return { valid: true }; // Key is valid but quota is exhausted
    }
    return { valid: false, error: err.message || "Could not verify API key" };
  }
}

async function getAI(userApiKey?: string, backupKeys: string[] = []) {
  // Collect all potential keys
  const keys: string[] = [];
  
  if (userApiKey) {
    keys.push(userApiKey);
  }

  // Add environment variables if any
  const envKey = (typeof process !== "undefined" ? (process.env.GEMINI_API_KEY || "") : "") || import.meta.env.VITE_GEMINI_API_KEY;
  if (envKey) keys.push(envKey);
  
  // Add backup keys (user provided in the rotate list)
  if (backupKeys && backupKeys.length > 0) {
    keys.push(...backupKeys);
  }
  
  // Filter unique non-empty keys
  const uniqueKeys = Array.from(new Set(keys.filter(k => !!k)));

  if (uniqueKeys.length === 0) {
    throw new Error("API Key Required: Please add your Gemini API key in Settings first to enable generation.");
  }
  
  return uniqueKeys;
}

async function withRetry<T>(
  action: (ai: GoogleGenAI) => Promise<T>,
  userApiKey?: string,
  backupKeys: string[] = []
): Promise<T> {
  const keys = await getAI(userApiKey, backupKeys);
  let lastError: any = null;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    try {
      const genAI = new GoogleGenAI({ apiKey: key });
      
      // Add a manual timeout wrap for the action
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Gemini API call timed out after 55 seconds.")), 55000)
      );
      
      return await Promise.race([action(genAI), timeoutPromise]) as T;
    } catch (error: any) {
      lastError = error;
      const errorMessage = String(error?.message || "").toLowerCase();
      console.error(`Gemini API Error with key index ${i}:`, error);

      // If it's a timeout or a serious error, we might want to try the next key
      if (i < keys.length - 1) {
        console.warn(`Key ${i} failed. Error: ${errorMessage}. Trying next rotating key...`);
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error("All provided API keys failed or were exhausted.");
}

export async function generateLessonPlan(
  subject: string,
  className: string,
  chapter: string,
  topics: string,
  numPeriods: number,
  content: string,
  userApiKey?: string,
  backupKeys: string[] = []
): Promise<WeeklyLessonPlan> {
  return withRetry(async (ai) => {
    const safeContent = truncateString(content);

    const prompt = `Generate exactly ${numPeriods} periods for the following:
      Subject: ${subject}
      Class: ${className}
      Chapter: ${chapter}
      Topics: ${topics}
      Textbook Context: ${safeContent}`;

    const systemInstruction = `You are an expert academic coordinator. Generate a concise Weekly Lesson Plan.
      FORMAT: Return JSON only.
      
      For each period, provide:
      1. slo: Student Learning Objectives (max 2 short bullets)
      2. explanation: Activities & Graphic Organizer (max 2 short bullets)
      3. assessment: Questions to assess learning (max 2 short bullets)
      4. classworkAndHomework: Homework assignments (max 2 short bullets)
      
      Tone should be appropriate for ${className}. Progress logically. Use "•" for bullets. Each bullet on a new line.`;

    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL, 
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            periods: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  slo: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  assessment: { type: Type.STRING },
                  classworkAndHomework: { type: Type.STRING }
                },
                required: ["slo", "explanation", "assessment", "classworkAndHomework"]
              }
            }
          },
          required: ["periods"]
        }
      }
    });

    const responseText = response.text;
    if (!responseText) throw new Error("Empty response from AI");
    
    try {
      const parsed = JSON.parse(responseText.trim());
      // Validate schema manually if it's missing periods
      if (!parsed.periods || !Array.isArray(parsed.periods)) {
        throw new Error("Invalid structure: missing periods array");
      }
      return parsed as WeeklyLessonPlan;
    } catch (e) {
      console.error("JSON Parse Error:", responseText);
      throw new Error("The AI failed to format the plan correctly. Please try again.");
    }
  }, userApiKey, backupKeys);
}

export async function generateLectureScript(
  subject: string,
  className: string,
  chapter: string,
  period: PeriodPlan,
  userApiKey?: string,
  backupKeys: string[] = []
): Promise<LectureScript> {
  return withRetry(async (ai) => {
    const prompt = `You are an expert educator. Based on the following Weekly Lesson Plan period details, expand it into a comprehensive LECTURE SCRIPT for a teacher to deliver in class.
    
    Subject: ${subject}
    Class: ${className}
    Chapter: ${chapter}
    
    Period Details:
    - SLO: ${period.slo}
    - Teacher Activities: ${period.explanation}
    
    Please generate a detailed lecture script including:
    1. A clear Lecture Title.
    2. A "Class Opening Hook" (2-3 sentences to grab attention).
    3. 4-5 sequential "Lecture Points". For each point, provide a short topic name and a "Teacher Script" (what the teacher should actually say).
    4. 3-5 "Check for Understanding" questions to ask during the lecture.
    5. A formal Lecture Summary/Conclusion.
    
    Write in a professional yet engaging tone, suitable for classroom delivery.`;

    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            introduction: { type: Type.STRING },
            lecturePoints: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  topic: { type: Type.STRING },
                  script: { type: Type.STRING }
                },
                required: ["topic", "script"]
              }
            },
            keyQuestions: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            summary: { type: Type.STRING }
          },
          required: ["title", "introduction", "lecturePoints", "keyQuestions", "summary"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    return JSON.parse(text.trim());
  }, userApiKey, backupKeys);
}

export async function searchResources(query: string, userApiKey?: string, backupKeys: string[] = []): Promise<{ title: string; snippet: string; link: string }[]> {
  return withRetry(async (ai) => {
    const prompt = `Search for educational resources, lesson materials, and textbook-style content related to: ${query}. 
    Return a list of 5-8 relevant sources.
    
    Output the list EXACTLY as a JSON array of objects. 
    Each object must have these exactly: "title", "snippet", and "link".
    DO NOT include any text before or after the JSON.
    DO NOT wrap the JSON in markdown code blocks.`;

    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL, 
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        tools: [{ googleSearch: {} }],
      }
    });

    const text = response.text;
    if (!text) return [];
    try {
      // Find JSON block in case it was wrapped or included extra text
      const trimmed = text.trim();
      const firstBracket = trimmed.indexOf("[");
      const lastBracket = trimmed.lastIndexOf("]");
      
      if (firstBracket === -1 || lastBracket === -1) {
        throw new Error("No JSON array found in response");
      }
      
      const jsonStr = trimmed.substring(firstBracket, lastBracket + 1);
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse search results:", text, e);
      return [];
    }
  }, userApiKey, backupKeys);
}

export async function extractPlanInfo(
  contentsArray: (string | { data: string; mimeType: string })[],
  userApiKey?: string,
  backupKeys: string[] = []
): Promise<Partial<LessonPlanForm>> {
  return withRetry(async (ai) => {
    const prompt = `You are a helpful assistant that extracts educational metadata and detailed textbook content from images, PDFs, or teacher notes.
Analyze all the provided documents collectively and extract:
1. Subject
2. Class (Map to: ${CLASSES.join(", ")})
3. Chapter Name
4. Topics Covered
5. Page Numbers
6. A detailed text extraction of the actual content/text found in all the documents combined (the "Content").

If multiple documents are provided, merge their contents logically into a single "Content" extraction.
If a field is not found, leave it empty.`;

    const parts: any[] = [];
    
    for (const content of contentsArray) {
      if (typeof content !== 'string') {
        parts.push({ 
          inlineData: { 
            data: content.data.split(',')[1] || content.data, 
            mimeType: content.mimeType 
          } 
        });
      } else {
        parts.push({ text: `[Document Section]: ${truncateString(content)}` });
      }
    }
    
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subject: { type: Type.STRING },
            className: { type: Type.STRING },
            chapter: { type: Type.STRING },
            topics: { type: Type.STRING },
            pageNos: { type: Type.STRING },
            content: { type: Type.STRING, description: "Detailed text extraction of the documents" }
          }
        }
      }
    });

    const text = response.text;
    if (!text) return {};
    try {
      return JSON.parse(text.trim());
    } catch (e) {
      return {};
    }
  }, userApiKey, backupKeys);
}
export async function getSearchSuggestions(
  subject: string,
  className: string,
  chapter: string,
  topics: string,
  userApiKey?: string,
  backupKeys: string[] = []
): Promise<string[]> {
  return withRetry(async (ai) => {
    const prompt = `Based on the following lesson plan details, suggest 3-5 specific, effective search queries for a teacher to find high-quality educational resources (videos, worksheets, interactive simulations, or articles).
    
    Subject: ${subject}
    Class: ${className}
    Chapter: ${chapter}
    Topics: ${topics}
    
    Return ONLY a JSON array of strings.`;

    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    const text = response.text;
    if (!text) return [];
    try {
      return JSON.parse(text.trim());
    } catch (e) {
      return [];
    }
  }, userApiKey, backupKeys);
}

export async function chatWithAssistant(
  messages: { role: 'user' | 'model'; parts: { text: string }[] }[],
  userApiKey?: string,
  backupKeys: string[] = []
): Promise<string> {
  return withRetry(async (ai) => {
    const systemInstruction = `[SYSTEM INSTRUCTION: You are a dedicated AI Teaching Assistant for "Weekly Lesson Plan Pro". 
    Help teachers with Lesson Planning, Application Guidance, and Pedagogical Advice.
    Be professional, concise, and helpful. Always verify AI-generated content.
    App features: generate plans from textbook content, customize periods, download PDF/Word, Lecture Script feature.]\n\n`;

    // Prepend system instruction to the first user message if it's the start
    // or just prepend to the very last message to ensure it's always followed
    const lastIdx = messages.length - 1;
    const chatHistory = [...messages];
    if (chatHistory[lastIdx].role === 'user') {
      chatHistory[lastIdx] = {
        ...chatHistory[lastIdx],
        parts: [{ text: systemInstruction + chatHistory[lastIdx].parts[0].text }]
      };
    }

    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: chatHistory
    });

    const responseText = response.text;
    if (!responseText) throw new Error("No response from AI");
    return responseText;
  }, userApiKey, backupKeys);
}

