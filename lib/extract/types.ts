export interface GenAI {
  category: string;
  explanation: string;
}

export interface LearningGoal {
  id: string;
  description: string;
}

export interface WorkloadEntry {
  activity: string;
  hours: number;
}

export interface CourseModule {
  number: number;
  title: string;
}

export interface Assessment {
  name: string;
  weighting_factor: number | null;
  form: string;
  group_or_individual: string;
  formative_or_summative: string;
  mandatory: boolean;
  minimum_grade: number | null;
  resit: boolean;
  resit_note: string | null;
  company_interaction: boolean;
  feedback_by: string;
  goals_assessed: string[];
  deadlines: string[];
}

export interface StudyMaterial {
  isbn: string | null;
  citation: string;
}

export interface ImportantDate {
  label: string;
  start: string;
  end: string | null;
}

export interface CourseManual {
  course_code: string;
  course_name: string;
  teaching_block: string | null;
  course_load_ec: number | null;
  coordinator: string[];
  teaching_staff: string[];
  course_activities: string[];
  examination_format: string[];
  mandatory_attendance: boolean | null;
  pre_requisites: boolean | null;
  pre_requisites_note: string | null;
  contact_email: string | null;
  genai: GenAI | null;
  learning_goals: LearningGoal[];
  workload: WorkloadEntry[];
  modules: CourseModule[];
  assessments: Assessment[];
  sdgs: string[];
  study_materials: StudyMaterial[];
  important_dates: ImportantDate[];
  raw_sections: Record<string, string>;
  warnings: string[];
  template_version_hint: {
    export_date: string;
    headings_present: string[];
  };
}
