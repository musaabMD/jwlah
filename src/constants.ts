import { InspectionSection, Inspector } from "./types";

export const INSPECTORS: Inspector[] = [
  { id: "1", name: "عبدالرحمن الأسمري" },
  { id: "2", name: "وليد البلوي" },
  { id: "3", name: "عادل حسين" },
  { id: "4", name: "مصعب الرحيلي" },
  { id: "5", name: "عبدالوهاب العواجي" },
  { id: "6", name: "ابراهيم الحربي" },
];

export const HOSPITALS = [
  "محطة قطار الحرمين",
  "مستشفى الحرم",
  "مستشفى السلام الوقفي",
  "مركز صحي الصافية",
  "مركز صحي باب جبريل",
  "مركز نجود",
  "مستشفى الملك فهد",
  "مستشفى المدينة العام",
  "مستشفى الميقات العام",
  "مركز الميقات الموسمي",
  "مركز صحي حجاج البر",
  "مركز الهجرة الموسمي",
  "مركز صحي الحرة الغربية",
  "مركز صحي قباء",
  "مركز صحي العوالي",
  "مركز صحي باب المجيدي",
];

export const SECTIONS: InspectionSection[] = [
  {
    id: "ipc_bundle_compliance_audit",
    title: "✅ IPC Bundle Compliance Audit (Improved + Auto-Scoring)",
    questions: [
      { id: "ipc_vae_1", text: "🌬️ VAE: Is the head of bed maintained at 30–45° (unless contraindicated)?" },
      { id: "ipc_vae_2", text: "🌬️ VAE: Is there documented daily sedation interruption or readiness-to-wean assessment?" },
      { id: "ipc_vae_3", text: "🌬️ VAE: Is oral care with antiseptic (e.g., chlorhexidine) performed as per protocol?" },
      {
        id: "ipc_vae_4",
        text: "🌬️ VAE: Are ventilator circuits handled using aseptic technique and not routinely changed?",
      },
      { id: "ipc_vae_5", text: "🌬️ VAE: Is there a daily documented assessment for extubation readiness?" },
      { id: "ipc_cauti_1", text: "🚽 CAUTI: Is there a documented appropriate indication for the catheter?" },
      { id: "ipc_cauti_2", text: "🚽 CAUTI: Was aseptic technique used during insertion (check record or observe)?" },
      { id: "ipc_cauti_3", text: "🚽 CAUTI: Is a closed drainage system intact with no breaks/leaks?" },
      { id: "ipc_cauti_4", text: "🚽 CAUTI: Is the urine bag positioned below bladder level and not touching the floor?" },
      { id: "ipc_cauti_5", text: "🚽 CAUTI: Is there a daily documented review for catheter necessity/removal?" },
      {
        id: "ipc_clabsi_1",
        text: "💉 CLABSI: Was hand hygiene performed before any line handling (observed or documented)?",
      },
      {
        id: "ipc_clabsi_2",
        text: "💉 CLABSI: Were maximal sterile barrier precautions used during insertion (cap, mask, gown, gloves, drape)?",
      },
      { id: "ipc_clabsi_3", text: "💉 CLABSI: Was chlorhexidine used for skin antisepsis at insertion site?" },
      { id: "ipc_clabsi_4", text: "💉 CLABSI: Is the dressing clean, dry, intact, and within change date?" },
      { id: "ipc_clabsi_5", text: "💉 CLABSI: Is there a daily documented review of line necessity?" },
      { id: "ipc_optional_1", text: "⭐ Optional: Are bundle checklists completed by staff consistently?" },
    ],
  },
  {
    id: "triage",
    title: "الفرز (Triage)",
    questions: [
      { id: "t1", text: "توفر منطقة مخصصة للفرز البصري عند مدخل الطوارئ والغسيل الكلوي" },
      { id: "t2", text: "توفر نموذج الفرز المعتمد" },
      { id: "t3", text: "وجود موظف مدرب ومخصص للفرز البصري" },
      { id: "t4", text: "وجود Flowchart يوضح خطوات التعامل مع الحالات التنفسية" },
      { id: "t5", text: "توجيه المرضى ذوي الأعراض التنفسية لارتداء الكمامات وتعقيم اليدين" },
      { id: "t6", text: "توفر ملصقات تعليمية (نظافة اليدين، آداب السعال، PPE)" },
      { id: "t7", text: "منطقة انتظار مخصصة لحالات الاشتباه (≥ 1.2 متر)" },
      { id: "t8", text: "توفر تعريفات الأمراض التنفسية حسب التنبيه الوطني" },
    ],
  },
  {
    id: "infection_control",
    title: "مكافحة العدوى - عام",
    questions: [
      { id: "ic1", text: "معرفة الكادر بالأمراض المعدية (إيبولا، ماربورغ، جدري القردة)" },
      { id: "ic2", text: "معرفة آلية الإبلاغ عن الأمراض المعدية" },
      { id: "ic3", text: "توفر سياسات وإجراءات مكافحة العدوى" },
      { id: "ic4", text: "توفر وسائل الحماية الشخصية (PPE)" },
      { id: "ic5", text: "توفر أدوات نظافة اليدين" },
      { id: "ic6", text: "التزام الكادر برخصة BICSL" },
    ],
  },
  {
    id: "isolation",
    title: "العزل (Isolation)",
    questions: [
      { id: "is1", text: "وجود غرف عزل (ضغط سلبي أو HEPA filter)" },
      { id: "is2", text: "توفر لوحات العزل (ملونة حسب النوع: تلامسي / هوائي / رذاذي)" },
      { id: "is3", text: "وجود مسار خاص لحالات العزل" },
      { id: "is4", text: "توفر مستلزمات العزل (كمامات، معقمات، PPE)" },
      { id: "is5", text: "وجود سجل للمخالطين" },
      { id: "is6", text: "صيانة HEPA موثقة" },
    ],
  },
  {
    id: "isolation_pathways",
    title: "مسارات العزل",
    questions: [
      { id: "ip1", text: "مسار آمن لنقل الحالات المشتبهة" },
      { id: "ip2", text: "تقليل حركة المرضى" },
      { id: "ip3", text: "اختيار الوقت والمسار المناسب للنقل" },
    ],
  },
  {
    id: "isolation_rooms",
    title: "غرف العزل",
    questions: [
      { id: "ir1", text: "تجهيز الغرفة بدورة مياه ومغسلة" },
      { id: "ir2", text: "توفر مغاسل داخل كل غرفة مريض" },
      { id: "ir3", text: "تدريب الكادر على تطهير اليدين" },
      { id: "ir4", text: "توفر جهاز PAPR عند الحاجة" },
    ],
  },
  {
    id: "medical_storage",
    title: "المستودع الطبي (Medical Storage)",
    questions: [
      { id: "ms1", text: "تهوية جيدة" },
      { id: "ms2", text: "مراقبة الحرارة (22–24°C) والرطوبة (<70%)" },
      { id: "ms3", text: "أرفف نظيفة مع مسافات قياسية (40 سم سقف، 20 سم أرض، 5 سم جدار)" },
    ],
  },
  {
    id: "medical_waste",
    title: "النفايات الطبية (Medical Waste)",
    questions: [
      { id: "mw1", text: "توفر حاويات وأكياس ملونة" },
      { id: "mw2", text: "فصل النفايات حسب النوع" },
      { id: "mw3", text: "التخلص من الأدوات الحادة عند ¾ الامتلاء" },
      { id: "mw4", text: "وضع ملصقات (تاريخ + مكان الإنتاج)" },
    ],
  },
  {
    id: "training",
    title: "التدريب (Training)",
    questions: [
      { id: "tr1", text: "تدريب على تطهير اليدين" },
      { id: "tr2", text: "التعامل مع الحالات التنفسية" },
      { id: "tr3", text: "فرز النفايات" },
      { id: "tr4", text: "توفر دليل إرشادي لمكافحة العدوى" },
    ],
  },
];
