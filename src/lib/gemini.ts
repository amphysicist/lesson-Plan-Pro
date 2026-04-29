/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { WeeklyLessonPlan, LessonPlanForm, SUBJECTS, CLASSES, LectureScript, PeriodPlan } from "../types";

async function getAI(userApiKey?: string, backupKeys: string[] = []) {
  // Collect all potential keys
  const keys: string[] = [];
  
  // Enforce: User must have their own key to get the "benefit" of backup/system keys
  if (userApiKey) {
    keys.push(userApiKey);
    
    // Add environment variables if any
    const envKey = (typeof process !== "undefined" ? (process.env.GEMINI_API_KEY || "") : "") || import.meta.env.VITE_GEMINI_API_KEY;
    if (envKey) keys.push(envKey);
    
    // Add backup keys (admin provided etc)
    keys.push(...backupKeys);
  }
  
  // Filter unique non-empty keys
  const uniqueKeys = Array.from(new Set(keys.filter(k => !!k)));

  if (uniqueKeys.length === 0) {
    throw new Error("API Key Required: Please add your own Gemini API key in Settings first to enable generation.");
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

  for (const key of keys) {
    try {
      const genAI = new GoogleGenAI({ apiKey: key });
      return await action(genAI);
    } catch (error: any) {
      lastError = error;
      const errorMessage = error?.message || "";
      // If it's a quota error (429), try the next key
      if (errorMessage.includes("429") || errorMessage.toLowerCase().includes("quota") || errorMessage.toLowerCase().includes("limit")) {
        console.warn(`API key limit reached, trying next key...`);
        continue;
      }
      // If it's a fatal error (invalid key etc.), maybe try next too?
      if (errorMessage.includes("403") || errorMessage.toLowerCase().includes("invalid")) {
        console.warn(`Invalid API key detected, trying next key...`);
        continue;
      }
      // For other errors, throw immediately
      throw error;
    }
  }

  throw lastError || new Error("All API keys failed or were exhausted.");
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
    // Complexity & Tone Guidance based on class
    let pedagogicalGuidance = "";
    const classNum = parseInt(className);
    const isLowerGrade = !isNaN(classNum) && classNum <= 5;
    const isHigherGrade = !isNaN(classNum) && classNum >= 9 || className.includes("11th") || className.includes("12th");

    if (isLowerGrade) {
      pedagogicalGuidance = `
      TONE & COMPLEXITY (Lower Grades - ${className}):
      - Use simple, storytelling language. 
      - Use relatable analogies (e.g., for Computer Science, compare a computer to a human brain or a magic box).
      - Focus on engagement, basic facts, and hands-on activities. 
      - Avoid jargon; explain terms simply (e.g., use 'a computer that can do many jobs' instead of 'universal machines').`;
    } else if (isHigherGrade) {
      pedagogicalGuidance = `
      TONE & COMPLEXITY (Higher Grades - ${className}):
      - Use formal, technical academic language.
      - Focus on technical depth, critical thinking, and formal exam objectives (e.g., relevant for Boards).
      - SLOs should be sophisticated and map to higher-order Blooms Taxonomy.`;
    } else {
      pedagogicalGuidance = `
      TONE & COMPLEXITY (Middle Grades - ${className}):
      - Balance relatable examples with introducing formal terminology.
      - Focus on conceptual understanding and application.`;
    }

    const prompt = `You are an expert academic coordinator and teacher trainer. Your task is to generate a highly detailed, humanized Weekly Lesson Plan following the FF Academics format.
Write in a natural, engaging way as if a passionate and experienced teacher is writing their personal lesson notes. Avoid overly formal or robotic phrasing; instead, use descriptive and practical language that reflects real-world classroom delivery.

Subject: ${subject}
Class: ${className}
Chapter: ${chapter}
Topics: ${topics}
Number of Periods: ${numPeriods}
Textbook Context: ${content}

${pedagogicalGuidance}

Please generate exactly ${numPeriods} periods. 

CRITICAL FORMATTING INSTRUCTION:
All information for each period MUST be presented as short, concise bullet points. Avoid long paragraphs. Use "•" symbol for bullets. Each bullet point should be on a NEW LINE. Each bullet point should be a single, clear thought. IMPORTANT: Provide a MAXIMUM of 2 bullet points for each section (SLO, Explanation, Assessment, Classwork/Homework).

Each period must have:
1. SLO: Concise bullet points. Clear, measurable, starting with an action verb (Blooms Taxonomy). Adjust complexity for ${className}.
2. Explanation: Concise bullet points of teaching activities including specific Graphic Organizers to be used (e.g., Venn Diagram, Concept Map, KWL Chart). Use analogies for younger children if applicable.
3. Assessment: Concise bullet points of specific questions or quick activities (Adopted to assess learning).
4. Class work/ Homework: Concise bullet points of clear tasks.

Ensure the progression is logical and fits the curriculum standards of the Pakistani education system.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview", // Specified in skills/system_skills/gemini_api/SKILL.md
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            periods: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  slo: { type: Type.STRING, description: "Student Learning Objective" },
                  explanation: { type: Type.STRING, description: "Main activities and name of the Graphic Organizer to be used" },
                  assessment: { type: Type.STRING, description: "Activities/questions Adopted to assess learning" },
                  classworkAndHomework: { type: Type.STRING, description: "Class work/ Homework assignments" }
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
    if (!responseText) throw new Error("No response from AI");
    
    try {
      return JSON.parse(responseText.trim()) as WeeklyLessonPlan;
    } catch (e) {
      console.error("Failed to parse Gemini response:", responseText);
      throw new Error("Invalid response format from AI");
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
      model: "gemini-3-flash-preview",
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
      model: "gemini-3-flash-preview", 
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
        parts.push({ text: `[Document Section]: ${content}` });
      }
    }
    
    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
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

