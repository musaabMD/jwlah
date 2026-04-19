
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
  id?: string;
  inspectors: string[];
  hospital: string;
  date: string;
  day: string;
  scores: Record<string, ScoreValue>;
  itemNotes: Record<string, string>;
  sectionNotes: Record<string, string>;
  sectionImages: Record<string, string[]>;
  /** Question IDs to exclude from this tour (unchecked in setup). */
  skippedQuestionIds?: string[];
}
