/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { WeeklyLessonPlan, LessonPlanForm, SUBJECTS, CLASSES, LectureScript, PeriodPlan } from "../types";

function getAI(userApiKey?: string) {
  // Use user-provided key if available, otherwise try environment variables
  const apiKey = userApiKey || (typeof process !== "undefined" ? (process.env.GEMINI_API_KEY || "") : "") || import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    if (userApiKey === "") {
        throw new Error("Please add your Gemini API Key in Settings to generate lesson plans.");
    }
    throw new Error("AI Configuration Missing: Please verify your Gemini API key.");
  }
  return new GoogleGenerativeAI(apiKey);
}

export async function generateLessonPlan(
  subject: string,
  className: string,
  chapter: string,
  topics: string,
  numPeriods: number,
  content: string,
  userApiKey?: string
): Promise<WeeklyLessonPlan> {
  const ai = getAI(userApiKey);
  
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

  const response = await ai.getGenerativeModel({ model: "gemini-1.5-flash" }).generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          periods: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                slo: { type: SchemaType.STRING, description: "Student Learning Objective" },
                explanation: { type: SchemaType.STRING, description: "Main activities and name of the Graphic Organizer to be used" },
                assessment: { type: SchemaType.STRING, description: "Activities/questions Adopted to assess learning" },
                classworkAndHomework: { type: SchemaType.STRING, description: "Class work/ Homework assignments" }
              },
              required: ["slo", "explanation", "assessment", "classworkAndHomework"]
            }
          }
        },
        required: ["periods"]
      }
    }
  });

  const responseText = response.response.text();
  if (!responseText) throw new Error("No response from AI");
  
  try {
    return JSON.parse(responseText.trim()) as WeeklyLessonPlan;
  } catch (e) {
    console.error("Failed to parse Gemini response:", responseText);
    throw new Error("Invalid response format from AI");
  }
}

export async function generateLectureScript(
  subject: string,
  className: string,
  chapter: string,
  period: PeriodPlan,
  userApiKey?: string
): Promise<LectureScript> {
  const ai = getAI(userApiKey);
  
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

  const response = await ai.getGenerativeModel({ model: "gemini-1.5-flash" }).generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          title: { type: SchemaType.STRING },
          introduction: { type: SchemaType.STRING },
          lecturePoints: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                topic: { type: SchemaType.STRING },
                script: { type: SchemaType.STRING }
              },
              required: ["topic", "script"]
            }
          },
          keyQuestions: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING }
          },
          summary: { type: SchemaType.STRING }
        },
        required: ["title", "introduction", "lecturePoints", "keyQuestions", "summary"]
      }
    }
  });

  const text = response.response.text();
  if (!text) throw new Error("No response from AI");
  return JSON.parse(text.trim());
}

export async function searchResources(query: string, userApiKey?: string): Promise<{ title: string; snippet: string; link: string }[]> {
  const ai = getAI(userApiKey);
  
  const response = await ai.getGenerativeModel({ model: "gemini-1.5-flash" }).generateContent({
    contents: [{ role: "user", parts: [{ text: `Search for educational resources, lesson materials, and textbook-style content related to: ${query}. Return a list of relevant sources with titles, brief summaries, and links.` }] }],
    tools: [{ googleSearch: {} }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            title: { type: SchemaType.STRING },
            snippet: { type: SchemaType.STRING },
            link: { type: SchemaType.STRING }
          },
          required: ["title", "snippet", "link"]
        }
      }
    }
  } as any);

  const text = response.response.text();
  if (!text) return [];
  try {
    return JSON.parse(text.trim());
  } catch (e) {
    return [];
  }
}

export async function extractPlanInfo(
  contentsArray: (string | { data: string; mimeType: string })[],
  userApiKey?: string
): Promise<Partial<LessonPlanForm>> {
  const ai = getAI(userApiKey);
  
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

  const response = await ai.getGenerativeModel({ model: "gemini-1.5-flash" }).generateContent({
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          subject: { type: SchemaType.STRING },
          className: { type: SchemaType.STRING },
          chapter: { type: SchemaType.STRING },
          topics: { type: SchemaType.STRING },
          pageNos: { type: SchemaType.STRING },
          content: { type: SchemaType.STRING, description: "Detailed text extraction of the documents" }
        }
      }
    }
  });

  const text = response.response.text();
  if (!text) return {};
  try {
    return JSON.parse(text.trim());
  } catch (e) {
    return {};
  }
}

