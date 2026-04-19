
export interface InspectionQuestion {
  id: string;
  text: string;
}

export interface InspectionSection {
  id: string;
  title: string;
  questions: InspectionQuestion[];
}

export interface Inspector {
  id: string;
  name: string;
}

export type ScoreValue = "yes" | "no" | "na" | null;

export interface InspectionData {
  inspectors: string[];
  hospital: string;
  date: string;
  day: string;
  scores: Record<string, ScoreValue>; 
  itemNotes: Record<string, string>; // Notes per question
  sectionNotes: Record<string, string>; // Notes per section
  sectionImages: Record<string, string[]>; // Images per section
}
