/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PeriodPlan {
  slo: string;
  explanation: string;
  assessment: string;
  classworkAndHomework: string;
}

export interface WeeklyLessonPlan {
  periods: PeriodPlan[];
}

export type SourceType = 'file' | 'text' | 'link' | 'search' | 'drive';

export interface Source {
  id: string;
  type: SourceType;
  title: string;
  content: string;
  selected: boolean;
  fileName?: string;
  mimeType?: string;
}

export interface LectureScript {
  title: string;
  introduction: string;
  lecturePoints: { topic: string; script: string }[];
  keyQuestions: string[];
  summary: string;
}

export interface LessonPlanForm {
  schoolName: string;
  week: string;
  dateFrom: string;
  dateTo: string;
  className: string;
  subject: string;
  chapter: string;
  topics: string;
  pageNos: string;
  numPeriods: string;
  teachingAids: string;
  content: string;
}

export const SUBJECTS = [
  "Physics", "Chemistry", "Biology", "Mathematics", "English", 
  "Urdu", "Computer Science", "Islamiyat", "Pakistan Studies", "General Science", "Social Studies",
  "History", "Geography", "Art", "Physical Education"
];

export const CLASSES = [
  "Nursery", "Prep", "1st", "2nd", "3rd", "4th", "5th",
  "6th", "7th", "8th", "9th", "10th", 
  "11th (Pre-Engineering)", "11th (Pre-Medical)", "11th (ICS)", "11th (Commerce)", "11th (Arts)",
  "12th (Pre-Engineering)", "12th (Pre-Medical)", "12th (ICS)", "12th (Commerce)", "12th (Arts)"
];
