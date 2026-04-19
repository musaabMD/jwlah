import React, { useState, useRef, ChangeEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ClipboardCheck, 
  MapPin, 
  Users, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  Plus, 
  Image as ImageIcon,
  Camera,
  Hospital,
  ArrowRight,
  TrendingUp,
  Award,
  CircleDashed,
  MessageSquare,
  FileText,
  Monitor,
  Layout,
  History,
  Trash2
} from "lucide-react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { INSPECTORS, HOSPITALS, SECTIONS } from "./constants";
import { InspectionData, ScoreValue } from "./types";

export default function App() {
  const [step, setStep] = useState<"setup" | "inspection" | "report" | "presentation" | "history">("setup");
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [history, setHistory] = useState<any[]>(() => {
    const saved = localStorage.getItem("tour_history");
    return saved ? JSON.parse(saved) : [];
  });
  const [data, setData] = useState<InspectionData>({
    inspectors: [],
    hospital: "",
    date: new Date().toISOString().split('T')[0],
    day: new Intl.DateTimeFormat('ar-SA', { weekday: 'long' }).format(new Date()),
    scores: {},
    itemNotes: {},
    sectionNotes: {},
    sectionImages: {}
  });

  const reportRef = useRef<HTMLDivElement>(null);

  const saveToHistory = (tourData: InspectionData) => {
    const tourWithMeta = {
      ...tourData,
      id: Date.now().toString(),
      totalScore: calculateTotalScore().percentage
    };
    const newHistory = [tourWithMeta, ...history];
    setHistory(newHistory);
    localStorage.setItem("tour_history", JSON.stringify(newHistory));
  };

  const deleteFromHistory = (id: string) => {
    const newHistory = history.filter(h => h.id !== id);
    setHistory(newHistory);
    localStorage.setItem("tour_history", JSON.stringify(newHistory));
  };

  const calculateSectionScore = (sectionId: string) => {
    const section = SECTIONS.find(s => s.id === sectionId);
    if (!section) return { earned: 0, total: 0, percentage: 0 };
    
    let total = 0;
    let earned = 0;
    
    section.questions.forEach(q => {
      const score = data.scores[q.id];
      if (score !== "na") {
        total += 1;
        if (score === "yes") {
          earned += 1;
        }
      }
    });

    return { 
      earned, 
      total, 
      percentage: total > 0 ? Math.round((earned / total) * 100) : 100 
    };
  };

  const calculateTotalScore = () => {
    let globalTotal = 0;
    let globalEarned = 0;

    SECTIONS.forEach(s => {
      const { earned, total } = calculateSectionScore(s.id);
      globalEarned += earned;
      globalTotal += total;
    });

    return { 
      earned: globalEarned, 
      total: globalTotal, 
      percentage: globalTotal > 0 ? Math.round((globalEarned / globalTotal) * 100) : 100 
    };
  };

  const downloadReport = async () => {
    if (!reportRef.current) return;
    const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    
    // Split into pages if too long
    let heightLeft = pdfHeight;
    let position = 0;
    const pageHeight = pdf.internal.pageSize.getHeight();

    pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
    heightLeft -= pageHeight;

    while (heightLeft >= 0) {
      position = heightLeft - pdfHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`تقرير_جولة_${data.hospital}_${data.date}.pdf`);
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>, sectionId: string) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            const currentImages = data.sectionImages[sectionId] || [];
            setData(prev => ({ 
              ...prev, 
              sectionImages: { 
                ...prev.sectionImages, 
                [sectionId]: [...currentImages, reader.result as string] 
              } 
            }));
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const isSectionComplete = (sectionId: string) => {
    const section = SECTIONS.find(s => s.id === sectionId);
    if (!section) return true;
    return section.questions.every(q => data.scores[q.id] !== undefined && data.scores[q.id] !== null);
  };

  const totalScoreInfo = calculateTotalScore();

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden" dir="rtl">
      {/* Header */}
      <header className="bg-indigo-900 text-white p-4 shadow-xl sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 p-2.5 rounded-2xl backdrop-blur-md">
              <ClipboardCheck className="w-6 h-6 text-indigo-300" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">الإدارة التنفيذية للطب الوقائي</h1>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[10px] text-indigo-200/60 uppercase tracking-widest font-bold">نموذج جولة إشرافية - موسم الحج 1447هـ</p>
                {data.inspectors.length > 0 && (
                  <div className="flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded-full border border-white/5">
                     <Users className="w-3 h-3 text-indigo-300" />
                     <span className="text-[10px] text-indigo-50 font-bold">
                       {data.inspectors.join(" - ")}
                     </span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(step === "setup" || step === "history") && (
              <button 
                onClick={() => setStep(step === "history" ? "setup" : "history")}
                className="p-2.5 bg-white/10 rounded-xl text-white hover:bg-white/20 transition-all border border-white/5"
              >
                {step === "history" ? <ClipboardCheck className="w-5 h-5" /> : <History className="w-5 h-5" />}
              </button>
            )}
            {(step === "inspection" || step === "report") && (
              <button 
                onClick={() => setStep(step === "report" ? "inspection" : "report")}
                className="px-4 py-2.5 bg-indigo-800 rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors flex items-center gap-2 border border-white/10"
              >
                {step === "report" ? <ArrowRight className="w-4 h-4 rotate-180" /> : <TrendingUp className="w-4 h-4" />}
                {step === "report" ? "عودة للتقييم" : "النتائج"}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 pb-32">
        <AnimatePresence mode="wait">
          {step === "history" && (
            <motion.div
              key="history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 rounded-lg">
                      <History className="w-5 h-5 text-indigo-600" />
                    </div>
                    <h2 className="font-bold text-xl text-slate-800">سجل الجولات السابقة</h2>
                  </div>
                  <button 
                    onClick={() => setStep("setup")}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
                  >
                    + جولة جديدة
                  </button>
                </div>

                {history.length === 0 ? (
                  <div className="text-center py-20 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
                    <History className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500 font-medium">لا توجد جولات محفوظة حالياً</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {history.map((tour) => (
                      <div key={tour.id} className="group p-6 bg-white border border-slate-100 rounded-3xl hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-50/50 transition-all">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-slate-800">{tour.hospital}</h3>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${tour.totalScore >= 80 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                {tour.totalScore}%
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-slate-400 font-medium">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {tour.date}
                              </span>
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {tour.inspectors.join(", ")}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => {
                                setData(tour);
                                setStep("report");
                              }}
                              className="px-4 py-2 bg-slate-50 text-indigo-600 text-xs font-bold rounded-xl hover:bg-indigo-50 transition-all border border-slate-100"
                            >
                              عرض التقرير
                            </button>
                            <button 
                              onClick={() => deleteFromHistory(tour.id)}
                              className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {step === "setup" && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6"
            >
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-2 bg-indigo-50 rounded-lg">
                    <Users className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h2 className="font-bold text-xl text-slate-800">فريق الجولة</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {INSPECTORS.map(inspector => (
                    <button
                      key={inspector.id}
                      onClick={() => {
                        const isSelected = data.inspectors.includes(inspector.name);
                        setData(prev => ({
                          ...prev,
                          inspectors: isSelected 
                            ? prev.inspectors.filter(n => n !== inspector.name)
                            : [...prev.inspectors, inspector.name]
                        }));
                      }}
                      className={`p-5 rounded-2xl border-2 transition-all flex items-center justify-between group ${
                        data.inspectors.includes(inspector.name)
                          ? "border-indigo-600 bg-indigo-50/50 text-indigo-900 font-bold"
                          : "border-slate-50 bg-slate-50/50 text-slate-600 hover:border-indigo-100"
                      }`}
                    >
                      <span>{inspector.name}</span>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                        data.inspectors.includes(inspector.name) ? "bg-indigo-600 text-white" : "bg-white border border-slate-200"
                      }`}>
                         {data.inspectors.includes(inspector.name) && <CheckCircle2 className="w-4 h-4" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-2 bg-indigo-50 rounded-lg">
                    <Hospital className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h2 className="font-bold text-xl text-slate-800">تفاصيل المنشأة والوقت</h2>
                </div>
                <div className="space-y-6">
                  <div className="relative">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest absolute right-4 -top-2 bg-white px-2">المنشأة الصحية المستهدفة</label>
                    <select
                      value={data.hospital}
                      onChange={e => setData(prev => ({ ...prev, hospital: e.target.value }))}
                      className="w-full p-5 bg-slate-50/50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all text-slate-800 font-medium"
                    >
                      <option value="">اختر المنشأة المختارة للجولة...</option>
                      {HOSPITALS.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="relative">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest absolute right-4 -top-2 bg-white px-2">تاريخ الجولة الميدانية</label>
                      <div className="relative">
                        <Calendar className="absolute right-5 top-5 w-5 h-5 text-indigo-400 pointer-events-none" />
                        <input
                          type="date"
                          value={data.date}
                          onChange={e => setData(prev => ({ ...prev, date: e.target.value }))}
                          className="w-full p-5 pr-14 bg-slate-50/50 border border-slate-100 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all text-slate-800 font-medium"
                        />
                      </div>
                    </div>
                    <div className="relative">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest absolute right-4 -top-2 bg-white px-2">اليوم</label>
                       <input
                        type="text"
                        value={data.day}
                        readOnly
                        className="w-full p-5 bg-slate-100/50 border border-slate-50 rounded-2xl text-slate-500 font-medium cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <button
                disabled={!data.hospital || data.inspectors.length === 0}
                onClick={() => setStep("inspection")}
                className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black text-lg rounded-2xl shadow-xl shadow-indigo-200 flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
              >
                <span>بدء الجولة الآن</span>
                <ArrowRight className="w-6 h-6 rotate-180" />
              </button>
            </motion.div>
          )}

          {step === "inspection" && (
            <motion.div
              key="inspection"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
                <div className="bg-slate-900 text-white p-6 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">القسم الحالي</span>
                      <h2 className="font-bold text-xl">{SECTIONS[currentSectionIndex].title}</h2>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-white/40 block">التقدم الإجمالي</span>
                      <span className="font-black text-2xl tracking-tighter text-indigo-400">
                        {currentSectionIndex + 1}
                        <span className="text-white/30 text-base font-medium">/{SECTIONS.length}</span>
                      </span>
                    </div>
                  </div>
                  
                  {/* Improved Progress Bar */}
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden relative">
                    <motion.div 
                      layoutId="progress-bar"
                      initial={false}
                      animate={{ width: `${((currentSectionIndex + 1) / SECTIONS.length) * 100}%` }}
                      className="h-full bg-gradient-to-l from-indigo-500 to-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.5)]"
                    />
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {SECTIONS[currentSectionIndex].questions.map((q, idx) => (
                    <div key={q.id} className="p-6 rounded-3xl bg-slate-50/50 border border-slate-100 group transition-all hover:bg-white hover:shadow-md">
                      <div className="flex flex-col gap-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex gap-4">
                            <span className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center text-xs font-black shrink-0">{idx + 1}</span>
                            <p className="text-slate-800 font-medium pt-1 leading-relaxed">{q.text}</p>
                          </div>
                          <div className="flex gap-2 shrink-0 p-1 bg-white rounded-2xl border border-slate-200 shadow-sm self-start">
                            {[
                              { val: "yes", label: "نعم", color: "bg-green-500", icon: CheckCircle2 },
                              { val: "no", label: "لا", color: "bg-red-500", icon: XCircle },
                              { val: "na", label: "N/A", color: "bg-slate-500", icon: CircleDashed }
                            ].map(opt => (
                              <button
                                key={opt.val}
                                onClick={() => setData(prev => ({ 
                                  ...prev, 
                                  scores: { ...prev.scores, [q.id]: opt.val as ScoreValue } 
                                }))}
                                className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
                                  data.scores[q.id] === opt.val
                                    ? `${opt.color} text-white shadow-lg`
                                    : "text-slate-400 hover:bg-slate-50"
                                }`}
                              >
                                <opt.icon className="w-4 h-4" />
                                <span>{opt.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Optional notes per question */}
                        <div className="relative group/note">
                           <MessageSquare className="absolute right-4 top-4 w-4 h-4 text-slate-300" />
                           <textarea
                            placeholder="ملاحظات إضافية لهذا البند..."
                            value={data.itemNotes[q.id] || ""}
                            onChange={e => setData(prev => ({ ...prev, itemNotes: { ...prev.itemNotes, [q.id]: e.target.value } }))}
                            className="w-full p-4 pr-12 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/10 text-sm min-h-[80px] resize-none transition-all"
                           />
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Section specific tools */}
                  <div className="pt-10 border-t border-slate-100 mt-10 space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-slate-800">
                        <MessageSquare className="w-5 h-5 text-indigo-500" />
                        <h3 className="font-bold">ملاحظات ختامية للقسم</h3>
                      </div>
                      <textarea
                        placeholder="أضف ملاحظة شاملة لهذا القسم من الجولة..."
                        value={data.sectionNotes[SECTIONS[currentSectionIndex].id] || ""}
                        onChange={e => setData(prev => ({ ...prev, sectionNotes: { ...prev.sectionNotes, [SECTIONS[currentSectionIndex].id]: e.target.value } }))}
                        className="w-full p-6 bg-slate-50 border border-slate-100 rounded-[2rem] outline-none focus:ring-4 focus:ring-indigo-500/10 text-sm min-h-[120px]"
                      />
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-slate-800">
                          <ImageIcon className="w-5 h-5 text-indigo-500" />
                          <h3 className="font-bold">التوثيق الصوري للقسم</h3>
                        </div>
                        <label className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold hover:bg-slate-50 cursor-pointer shadow-sm">
                          <Plus className="w-4 h-4" />
                          <span>إضافة صورة</span>
                          <input type="file" multiple accept="image/*" className="hidden" onChange={e => handleImageUpload(e, SECTIONS[currentSectionIndex].id)} />
                        </label>
                      </div>
                      
                      <div className="grid grid-cols-4 md:grid-cols-6 gap-3">
                        {(data.sectionImages[SECTIONS[currentSectionIndex].id] || []).map((img, i) => (
                          <div key={i} className="aspect-square rounded-2xl overflow-hidden border border-slate-100 relative group">
                            <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <button 
                              onClick={() => {
                                const current = [...data.sectionImages[SECTIONS[currentSectionIndex].id]];
                                current.splice(i, 1);
                                setData(prev => ({ ...prev, sectionImages: { ...prev.sectionImages, [SECTIONS[currentSectionIndex].id]: current } }));
                              }}
                              className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <XCircle className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Minimal Navigation Footer */}
              <div className="fixed bottom-6 inset-x-6 z-40">
                <div className="max-w-2xl mx-auto flex items-center gap-3 bg-white/95 backdrop-blur-md p-2 rounded-2xl shadow-2xl border border-slate-100">
                  <button
                    onClick={() => {
                      if (currentSectionIndex > 0) {
                        setCurrentSectionIndex(prev => prev - 1);
                        window.scrollTo(0, 0);
                      } else {
                        setStep("setup");
                      }
                    }}
                    className="p-4 bg-slate-50 text-slate-600 font-bold rounded-xl hover:bg-slate-100 transition-all flex items-center justify-center shrink-0"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                  <button
                    disabled={!isSectionComplete(SECTIONS[currentSectionIndex].id)}
                    onClick={() => {
                      if (currentSectionIndex < SECTIONS.length - 1) {
                        setCurrentSectionIndex(prev => prev + 1);
                        window.scrollTo(0, 0);
                      } else {
                        setStep("report");
                      }
                    }}
                    className="flex-1 py-4 bg-indigo-600 disabled:bg-slate-100 disabled:text-slate-400 text-white font-black rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all active:scale-[0.98]"
                  >
                    <span>{currentSectionIndex < SECTIONS.length - 1 ? "حفظ ومتابعة" : "إنهاء الجولة وعرض النتائج"}</span>
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                </div>
                {!isSectionComplete(SECTIONS[currentSectionIndex].id) && (
                   <motion.p 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center text-[10px] font-bold text-red-500 mt-3 drop-shadow-sm"
                   >
                     يرجى تقييم كافة النقاط قبل الانتقال للقسم التالي
                   </motion.p>
                )}
              </div>
            </motion.div>
          )}

          {step === "report" && (
            <motion.div
              key="report"
              initial={{ scale: 1.05, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onViewportEnter={() => {
                // Auto-save when report is viewed first time if not already in history
                if (!history.find(h => h.id === data.id)) {
                  saveToHistory(data);
                }
              }}
              className="space-y-6 pb-24"
            >
              {/* Header Actions for Report */}
              <div className="flex gap-2 justify-end mb-4">
                 <button onClick={() => setStep("presentation")} className="px-4 py-2 bg-indigo-950 text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-black transition-all">
                    <Monitor className="w-4 h-4" />
                    عرض تقديمي PPT
                 </button>
                 <button onClick={downloadReport} className="px-4 py-2 bg-white border border-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-slate-50 transition-all">
                    <Download className="w-4 h-4" />
                    تحميل PDF
                 </button>
              </div>

              <div ref={reportRef} className="bg-white p-12 rounded-[2.5rem] shadow-2xl border border-slate-100" id="official-report">
                <div className="flex justify-between items-start mb-16 pb-8 border-b-2 border-slate-50">
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                       <div className="w-16 h-16 bg-indigo-900 rounded-2xl flex items-center justify-center">
                          <ClipboardCheck className="w-10 h-10 text-white" />
                       </div>
                       <div>
                          <h2 className="text-3xl font-black text-slate-900 leading-none">تقرير جولة تفتيشية</h2>
                          <p className="text-indigo-600 font-bold mt-1 text-sm tracking-widest uppercase">الإدارة التنفيذية للطب الوقائي</p>
                       </div>
                    </div>
                    <div className="flex gap-4">
                       <div className="px-4 py-2 bg-slate-50 rounded-xl text-xs font-bold text-slate-500 flex items-center gap-2">
                          <Hospital className="w-4 h-4" />
                          {data.hospital}
                       </div>
                       <div className="px-4 py-2 bg-slate-50 rounded-xl text-xs font-bold text-slate-500 flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          {data.date}
                       </div>
                    </div>
                  </div>
                  <div className="text-left space-y-2">
                    <p className="font-black text-4xl text-indigo-900 tracking-tighter">{totalScoreInfo.percentage}%</p>
                    <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase">نسبة الامتثال الكلية</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-20">
                   {SECTIONS.map(s => {
                      const { earned, total, percentage } = calculateSectionScore(s.id);
                      return (
                        <div key={s.id} className="relative group bg-slate-50 border border-slate-100 p-5 rounded-[2rem] transition-all hover:bg-white hover:shadow-2xl hover:border-indigo-100">
                          <div className="flex flex-col gap-4">
                             <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 truncate">{s.title}</h4>
                             
                             <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                  <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-black text-slate-800 tracking-tighter">{earned}/{total}</span>
                                  </div>
                                  <p className="text-[9px] font-bold text-slate-400">إجمالي النقاط</p>
                                </div>
                                <div className="text-right">
                                  <div className={`text-2xl font-black tracking-tighter ${percentage >= 80 ? 'text-green-600' : 'text-amber-600'}`}>
                                    {percentage}%
                                  </div>
                                  <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                                     <div 
                                      className={`h-full ${percentage >= 80 ? 'bg-green-500' : 'bg-amber-500'}`} 
                                      style={{ width: `${percentage}%` }}
                                     />
                                  </div>
                                </div>
                             </div>
                          </div>
                        </div>
                      );
                   })}
                </div>

                <div className="space-y-20">
                  {SECTIONS.map(section => {
                    const { earned, total, percentage } = calculateSectionScore(section.id);
                    return (
                      <div key={section.id} className="relative">
                        <div className="flex items-center justify-between mb-8">
                           <h3 className="text-2xl font-black text-slate-900 border-r-8 border-indigo-600 pr-5">{section.title}</h3>
                           <div className="px-5 py-2 bg-indigo-50 text-indigo-700 rounded-2xl text-xs font-black">تقييم المرحلة: {earned}/{total} ({percentage}%)</div>
                        </div>

                        <div className="overflow-hidden bg-white border border-slate-100 rounded-3xl mb-6">
                          <table className="w-full text-sm border-collapse">
                            <thead className="bg-slate-50 text-slate-400 border-b border-slate-100">
                              <tr>
                                <th className="p-5 text-right font-black uppercase tracking-wider text-[10px]">البند والمعيار</th>
                                <th className="p-5 text-center font-black uppercase tracking-wider text-[10px] w-24">التقييم</th>
                                <th className="p-5 text-right font-black uppercase tracking-wider text-[10px]">ملاحظات المفتش</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {section.questions.map(q => (
                                <tr key={q.id}>
                                  <td className="p-5 text-slate-700 font-medium">{q.text}</td>
                                  <td className="p-5 text-center">
                                    <span className={`inline-block px-3 py-1 rounded-lg text-[10px] font-black uppercase ${
                                      data.scores[q.id] === 'yes' ? 'bg-green-100 text-green-700' :
                                      data.scores[q.id] === 'no' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'
                                    }`}>
                                      {data.scores[q.id] === 'yes' ? 'نعم' : data.scores[q.id] === 'no' ? 'لا' : 'N/A'}
                                    </span>
                                  </td>
                                  <td className="p-5 text-slate-400 italic text-xs italic">{data.itemNotes[q.id] || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {data.sectionNotes[section.id] && (
                          <div className="p-6 bg-amber-50 rounded-3xl border border-amber-100 mb-6">
                            <p className="text-[10px] font-bold text-amber-700 uppercase mb-2">ملاحظة القسم الشاملة:</p>
                            <p className="text-slate-800 font-medium leading-relaxed">{data.sectionNotes[section.id]}</p>
                          </div>
                        )}

                        {data.sectionImages[section.id]?.length > 0 && (
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
                            {data.sectionImages[section.id].map((img, i) => (
                              <div key={i} className="aspect-video rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
                                <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-24 pt-12 border-t border-slate-100 flex justify-between items-center opacity-50">
                   <div className="text-[10px] font-bold text-slate-400">تجمع المدينة الصحي 1447هـ</div>
                </div>
              </div>
            </motion.div>
          )}

          {step === "presentation" && (
            <motion.div
              key="presentation"
              initial={{ scale: 1.1, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="fixed inset-0 bg-indigo-950 z-[100] overflow-y-auto p-4 md:p-12 text-white"
              dir="rtl"
            >
              <div className="max-w-6xl mx-auto space-y-32 py-20">
                <button 
                  onClick={() => setStep("report")}
                  className="fixed top-8 left-8 bg-white/10 hover:bg-white/20 p-4 rounded-full backdrop-blur-md transition-all z-[110]"
                >
                   <ArrowRight className="w-6 h-6" />
                </button>

                {/* Slide 1: Welcome */}
                <div className="min-h-[80vh] flex flex-col justify-center items-center text-center space-y-8">
                   <div className="w-32 h-32 bg-white text-indigo-900 rounded-[2.5rem] flex items-center justify-center shadow-2xl mb-8">
                      <Hospital className="w-16 h-16" />
                   </div>
                   <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-tight">نتائج الجولة الإشرافية<br/><span className="text-indigo-400">{data.hospital}</span></h1>
                   <div className="flex gap-6 text-xl text-indigo-200/60 font-medium">
                      <p>{data.date}</p>
                      <p>•</p>
                      <p>{data.day}</p>
                   </div>
                </div>

                {/* Slide 2: Overall Score */}
                <div className="min-h-[80vh] flex flex-col justify-center space-y-16">
                   <h2 className="text-4xl font-black border-r-8 border-white pr-6">ملخص الأداء الكلي</h2>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-20 items-center">
                      <div className="space-y-8">
                         <div className="p-8 bg-white/5 rounded-[3rem] border border-white/10">
                            <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-4">الامتثال العام</p>
                            <p className="text-8xl font-black">{totalScoreInfo.percentage}%</p>
                         </div>
                         <div className="flex gap-4">
                            {data.inspectors.map(name => (
                              <div key={name} className="px-6 py-3 bg-white/10 rounded-2xl text-sm font-bold">{name}</div>
                            ))}
                         </div>
                      </div>
                      <div className="space-y-4">
                         {SECTIONS.map(s => {
                            const { percentage } = calculateSectionScore(s.id);
                            return (
                               <div key={s.id} className="space-y-2">
                                  <div className="flex justify-between text-xs font-bold opacity-60">
                                     <span>{s.title}</span>
                                     <span>{percentage}%</span>
                                  </div>
                                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                                     <motion.div 
                                      initial={{ width: 0 }} 
                                      animate={{ width: `${percentage}%` }}
                                      className={`h-full ${percentage >= 80 ? 'bg-green-500' : 'bg-amber-500'}`} 
                                     />
                                  </div>
                               </div>
                            );
                         })}
                      </div>
                   </div>
                </div>

                {/* Slides for each section */}
                {SECTIONS.map(section => {
                   const { earned, total, percentage } = calculateSectionScore(section.id);
                   const images = data.sectionImages[section.id] || [];
                   return (
                     <div key={section.id} className="min-h-[80vh] flex flex-col justify-center space-y-12">
                        <div className="flex items-center justify-between border-b-2 border-white/10 pb-8">
                           <div className="space-y-2">
                              <h2 className="text-5xl font-black">{section.title}</h2>
                              <p className="text-indigo-400 font-bold text-lg">تقييم المرحلة: {earned}/{total}</p>
                           </div>
                           <div className="text-6xl font-black text-white/20">{percentage}%</div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                           <div className="grid grid-cols-1 gap-3 content-start">
                              {section.questions.map(q => (
                                <div key={q.id} className="p-4 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-between gap-4">
                                   <p className="text-sm font-medium opacity-80 leading-snug">{q.text}</p>
                                   <div className={`shrink-0 px-3 py-1 rounded-lg text-[10px] font-black uppercase ${
                                      data.scores[q.id] === 'yes' ? 'bg-green-500 text-white' :
                                      data.scores[q.id] === 'no' ? 'bg-red-500 text-white' : 'bg-slate-500 text-white'
                                   }`}>
                                      {data.scores[q.id] === 'yes' ? 'نعم' : data.scores[q.id] === 'no' ? 'لا' : 'N/A'}
                                   </div>
                                </div>
                              ))}
                           </div>
                           <div className="space-y-8">
                              {images.length > 0 ? (
                                <div className="grid grid-cols-2 gap-4">
                                   {images.slice(0, 4).map((img, i) => (
                                      <div key={i} className="aspect-video rounded-3xl overflow-hidden shadow-2xl border border-white/10">
                                         <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                      </div>
                                   ))}
                                </div>
                              ) : null}
                              {data.sectionNotes[section.id] ? (
                                <div className="p-10 bg-indigo-900/50 border border-white/10 rounded-[3rem] backdrop-blur-sm">
                                   <div className="flex items-center gap-2 mb-4 opacity-40">
                                      <MessageSquare className="w-5 h-5" />
                                      <p className="text-[10px] font-black uppercase tracking-widest">ملاحظات اللجنة وتوصياتها</p>
                                   </div>
                                   <p className="text-2xl font-bold leading-relaxed italic text-indigo-100">"{data.sectionNotes[section.id]}"</p>
                                </div>
                              ) : !images.length && (
                                <div className="h-64 rounded-[3rem] bg-white/5 border border-dashed border-white/20 flex flex-col items-center justify-center text-white/20">
                                   <Layout className="w-16 h-16 mb-4" />
                                   <p className="font-bold">لا توجد ملاحظات أو صور لهذا القسم</p>
                                </div>
                              )}
                           </div>
                        </div>
                     </div>
                   );
                })}

                {/* Final Slide */}
                <div className="min-h-[80vh] flex flex-col justify-center items-center text-center">
                   <h2 className="text-6xl font-black mb-8 italic">شكراً لكم</h2>
                   <p className="text-2xl text-indigo-300">الإدارة التنفيذية للطب الوقائي ومكافحة العدوى</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
