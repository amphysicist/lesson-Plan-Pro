/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import html2pdf from "html2pdf.js";
import html2canvas from "html2canvas";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";
import { 
  FileText, 
  Sparkles, 
  RotateCcw, 
  Upload, 
  ChevronRight, 
  BookOpen, 
  Presentation,
  GraduationCap, 
  Calendar,
  AlertCircle,
  FileDown,
  Image as ImageIcon,
  FileText as FileWord,
  Pencil,
  CheckCircle2,
  Plus,
  Grid,
  Square,
  Maximize2,
  Trash2,
  Loader2,
  File,
  Bold,
  Italic,
  List,
  ListOrdered,
  Cloud,
  Save,
  Check,
  Moon,
  Sun,
  Share2,
  Link,
  Copy,
  Download,
  ChevronDown,
  Mic2,
  X,
  ArrowLeft,
  Lock,
  LockOpen,
  Archive,
  History,
  QrCode,
  Globe,
  Database,
  Search,
  Video,
  BookOpen as BookOpenIcon,
  AlertCircle as AlertCircleIcon
} from "lucide-react";
import { 
  SUBJECTS, 
  CLASSES, 
  LessonPlanForm, 
  WeeklyLessonPlan,
  LectureScript,
  PeriodPlan,
  Source,
  SourceType
} from "./types";
import { generateLessonPlan, extractPlanInfo, generateLectureScript, searchResources } from "./lib/gemini";
import { sharePlan, getSharedPlan, auth, onAuthStateChanged, archivePlan, getArchivedPlans, deleteArchivedPlan, SharedPlan } from "./lib/firebase";
import { QRCodeSVG } from 'qrcode.react';

const extractTextFromPDF = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(" ");
    fullText += pageText + "\n";
  }
  return fullText;
};

const extractTextFromDocx = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
};

export default function App() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [success, setSuccess] = useState("");
  const [lastGeneratedClass, setLastGeneratedClass] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [plan, setPlan] = useState<WeeklyLessonPlan | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [authorName, setAuthorName] = useState<string | null>(null);
  const [user, setUser] = useState(auth.currentUser);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [lectureExportMenuOpen, setLectureExportMenuOpen] = useState(false);
  const [lectureScript, setLectureScript] = useState<LectureScript | null>(null);
  const [generatingLecture, setGeneratingLecture] = useState(false);
  const [activePeriodForLecture, setActivePeriodForLecture] = useState<number>(0);
  const [activeView, setActiveView] = useState<'builder' | 'lecture'>('builder');
  const [archivedPlans, setArchivedPlans] = useState<SharedPlan[]>([]);
  const [showArchives, setShowArchives] = useState(false);
  const [archiving, setArchiving] = useState(false);

  // Initialize PDF.js worker safely
  useEffect(() => {
    try {
      // Small protection against libraries trying to override read-only fetch
      const currentFetch = window.fetch;
      try {
        (window as any).fetch = currentFetch;
      } catch (e) {
        // fetch is read-only, which is fine, we just want to avoid 
        // libraries crashing when they try to polyfill it.
        console.debug("Note: window.fetch is read-only in this environment.");
      }

      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url
      ).toString();
    } catch (err) {
      console.error("PDF.js worker initialization failed:", err);
    }
  }, []);

  // Interactive Table State
  const [colWidths, setColWidths] = useState([20, 30, 25, 25]);
  const [rowHeights, setRowHeights] = useState<number[]>([]);
  const [activeCell, setActiveCell] = useState<{ row: number; col: number; section: 'info' | 'slo' } | null>(null);
  const [cellBorders, setCellBorders] = useState<Record<string, { top?: boolean; bottom?: boolean; left?: boolean; right?: boolean }>>({});
  const [resizing, setResizing] = useState<{ idx: number; type: 'col' | 'row' } | null>(null);

  const [sources, setSources] = useState<Source[]>([]);
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [activeSourceTab, setActiveSourceTab] = useState<SourceType>('file');
  const [manualText, setManualText] = useState("");
  const [links, setLinks] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ title: string; snippet: string; link: string; selected?: boolean }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const [form, setForm] = useState<LessonPlanForm>({
    schoolName: "Fauji Foundation School & College",
    week: "",
    dateFrom: "",
    dateTo: "",
    className: "",
    subject: "",
    chapter: "",
    topics: "",
    pageNos: "",
    numPeriods: "5",
    teachingAids: "Whiteboard, Markers, Textbook, Charts",
    content: "",
  });

  const logoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const lectureRef = useRef<HTMLDivElement>(null);

  // Auto-save Persistence & Share Loading
  useEffect(() => {
    // Check for shared plan first
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('share');
    
    if (shareId) {
      setLoading(true);
      getSharedPlan(shareId).then(shared => {
        if (shared) {
          setForm(shared.form);
          setPlan(shared.plan);
          setAuthorName(shared.authorName);
          setSuccess("Shared plan loaded successfully!");
        } else {
          setError("Shared plan not found or link has expired.");
        }
      }).catch(err => {
        setError("Failed to load shared plan.");
        console.error(err);
      }).finally(() => {
        setLoading(false);
      });
      return; // Skip local storage load if sharing
    }

    const savedForm = localStorage.getItem('plan_builder_form');
    const savedPlan = localStorage.getItem('plan_builder_plan');
    if (savedForm) {
      try {
        setForm(JSON.parse(savedForm));
      } catch (e) { console.error("Could not load saved form"); }
    }
    if (savedPlan) {
      try {
        setPlan(JSON.parse(savedPlan));
      } catch (e) { console.error("Could not load saved plan"); }
    }
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        getArchivedPlans().then(setArchivedPlans).catch(console.error);
      } else {
        setArchivedPlans([]);
      }
    });
  }, []);

  useEffect(() => {
    // Prevent saving if both are essentially empty (initial state)
    if (!plan && form.week === "" && form.chapter === "") return;

    const timer = setTimeout(() => {
      localStorage.setItem('plan_builder_form', JSON.stringify(form));
      if (plan) {
        localStorage.setItem('plan_builder_plan', JSON.stringify(plan));
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [form, plan]);

  const handleNew = () => {
    // Clear all persistence to ensure a fresh start
    localStorage.removeItem('plan_builder_form');
    localStorage.removeItem('plan_builder_plan');
    
    // Force a fresh reload and strip query params (important for sharing)
    window.location.href = window.location.origin + window.location.pathname;
  };

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setLogoUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleChange = (k: keyof LessonPlanForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
  };

  const handleGenerate = async () => {
    const required: (keyof LessonPlanForm)[] = ["week", "dateFrom", "dateTo", "className", "subject", "chapter", "topics"];
    for (const k of required) {
      if (!form[k].trim()) {
        setError(`Please fill in: ${k.replace(/([A-Z])/g, " $1").toLowerCase()}`);
        return;
      }
    }

    setError("");
    setLoading(true);
    setPlan(null);
    setError("");

    try {
      const selectedSources = sources.filter(s => s.selected);
      let contextualContent = "";
      
      if (selectedSources.length > 0) {
        contextualContent = `RESOURCES CONTEXT:\n${selectedSources.map(s => `[Title: ${s.title}, Type: ${s.type}]: ${s.content}`).join('\n\n')}`;
        if (form.content.trim()) {
          contextualContent += `\n\nMANUAL DIRECTIVES (PRIORITY):\n${form.content}`;
        }
      } else {
        contextualContent = form.content.trim();
      }

      const generated = await generateLessonPlan(
        form.subject,
        form.className,
        form.chapter,
        form.topics,
        parseInt(form.numPeriods),
        contextualContent
      );
      // Ensure we only keep the number of periods requested
      const slicedPlan = {
        ...generated,
        periods: generated.periods.slice(0, parseInt(form.numPeriods))
      };
      setPlan(slicedPlan);
      setLastGeneratedClass(form.className);
    } catch (err: any) {
      const msg = err.message || String(err);
      if (msg.includes("API_KEY") || msg.includes("VITE_GEMINI_API_KEY")) {
        setError("AI Configuration Error: Please verify your Gemini API key (VITE_GEMINI_API_KEY) in your Vercel environment variables.");
      } else {
        setError(msg || "Failed to generate lesson plan. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleColResize = (idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    setResizing({ idx, type: 'col' });
    const startX = e.pageX;
    const startWidths = [...colWidths];

    const onMouseMove = (moveEvent: MouseEvent) => {
      const diff = ((moveEvent.pageX - startX) / (printRef.current?.offsetWidth || 1)) * 100;
      const newWidths = [...startWidths];
      newWidths[idx] = Math.max(5, startWidths[idx] + diff);
      newWidths[idx + 1] = Math.max(5, startWidths[idx + 1] - diff);
      setColWidths(newWidths);
    };

    const onMouseUp = () => {
      setResizing(null);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleRowResize = (idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    setResizing({ idx, type: 'row' });
    const startY = e.pageY;
    const initialHeights = [...rowHeights];
    if (initialHeights.length === 0 && plan) {
      // Initialize heights if empty (get from actual row height)
      // This is simplified; usually we'd use refs for each row
    }

    const onMouseMove = (moveEvent: MouseEvent) => {
      const diff = moveEvent.pageY - startY;
      const newHeights = [...rowHeights];
      newHeights[idx] = Math.max(30, (newHeights[idx] || 60) + diff);
      setRowHeights(newHeights);
    };

    const onMouseUp = () => {
      setResizing(null);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const handleCellEdit = (section: 'info' | 'slo', row: number, col: number, field: string, value: string) => {
    if (section === 'slo' && plan) {
      const newPeriods = [...plan.periods];
      (newPeriods[row] as any)[field] = value;
      setPlan({ ...plan, periods: newPeriods });
    } else if (section === 'info') {
      setForm(f => ({ ...f, [field]: value }));
    }
  };

  const execFormatting = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
  };

  const addSource = (source: Omit<Source, 'id' | 'selected'>) => {
    const newSource: Source = {
      ...source,
      id: Math.random().toString(36).substring(2, 9),
      selected: true
    };
    setSources(prev => [...prev, newSource]);
    setSuccess(`Source "${source.title}" added to your hub.`);
  };

  const handleFilesAdded = async (newFiles: FileList | File[]) => {
    const filesArray = Array.from(newFiles);
    setError("");
    setSuccess("");
    
    setAnalyzing(true);
    let count = 0;
    
    try {
      for (const file of filesArray) {
        let content = "";
        let mimeType = file.type;
        
        if (file.type.includes("image")) {
          content = await fileToBase64(file);
        } else if (file.type === "application/pdf") {
          content = await extractTextFromPDF(file);
        } else if (file.type.includes("word") || file.name.endsWith(".docx")) {
          content = await extractTextFromDocx(file);
        } else if (file.type.includes("text") || file.name.endsWith(".txt")) {
          content = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsText(file);
          });
        }

        if (content) {
          addSource({
            type: 'file',
            title: file.name,
            content: content,
            fileName: file.name,
            mimeType: mimeType
          });
          count++;
        }
      }
      if (count > 0) {
        setShowAddSourceModal(false);
      }
    } catch (err: any) {
      setError("Failed to process some files: " + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleSourceSelection = (id: string) => {
    setSources(prev => prev.map(s => s.id === id ? { ...s, selected: !s.selected } : s));
  };

  const removeSource = (id: string) => {
    setSources(prev => prev.filter(s => s.id !== id));
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await searchResources(searchQuery);
      setSearchResults(results);
    } catch (err) {
      console.error("Search failed:", err);
      setError("Search failed. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddLink = (url: string) => {
    if (!url.trim()) return;
    // Simple validation
    if (!url.startsWith('http')) {
      setError("Please enter a valid URL starting with http:// or https://");
      return;
    }
    addSource({
      type: 'link',
      title: url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0],
      content: url
    });
    setShowAddSourceModal(false);
  };

  const handleAddPaste = () => {
    if (!manualText.trim()) return;
    addSource({
      type: 'text',
      title: manualText.substring(0, 30) + (manualText.length > 30 ? '...' : ''),
      content: manualText
    });
    setManualText("");
    setShowAddSourceModal(false);
  };

  const analyzeSources = async () => {
    const selectedSources = sources.filter(s => s.selected);
    
    if (selectedSources.length === 0) {
      setError("Please select at least one source from your hub.");
      return;
    }
    
    setAnalyzing(true);
    setError("");
    setSuccess("");
    
    try {
      const contentsForGemini = selectedSources.map(s => {
        if (s.type === 'file' && s.mimeType?.includes('image')) {
          return { data: s.content, mimeType: s.mimeType };
        }
        return `[Source: ${s.title} (${s.type})]: ${s.content}`;
      });

      const res = await extractPlanInfo(contentsForGemini);
      
      setForm(f => ({
        ...f,
        subject: res.subject || f.subject,
        className: res.className || f.className,
        chapter: res.chapter || f.chapter,
        topics: res.topics || f.topics,
        pageNos: res.pageNos || f.pageNos,
        content: res.content || f.content,
      }));

      setSuccess("Analysis Complete! Resources integrated.");
    } catch (err: any) {
      console.error(err);
      setError("Integration failed: " + err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const onDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesAdded(e.dataTransfer.files);
    }
  };

  const handleRemoveRow = (index: number) => {
    if (!plan) return;
    const newPeriods = [...plan.periods];
    newPeriods.splice(index, 1);
    setPlan({ ...plan, periods: newPeriods });
    setRowHeights(prev => {
      const copy = [...prev];
      copy.splice(index + 2, 1);
      return copy;
    });
  };

  const handleAddRowAtIndex = (index: number) => {
    if (!plan) return;
    const newPeriods = [...plan.periods];
    newPeriods.splice(index + 1, 0, { slo: "• ", explanation: "• ", assessment: "• ", classworkAndHomework: "• " });
    setPlan({ ...plan, periods: newPeriods });
    setRowHeights(prev => {
      const copy = [...prev];
      copy.splice(index + 3, 0, 0); // Insert auto height
      return copy;
    });
  };

  const handleAddRow = () => {
    if (!plan) return;
    setPlan({
      ...plan,
      periods: [...plan.periods, { slo: "• ", explanation: "• ", assessment: "• ", classworkAndHomework: "• " }]
    });
  };

  const handleAddCol = () => {
    // This is more complex as it breaks the schema, but we'll add it by adding a dummy field if needed
    // However, for this specific form, we'll allow users to "split" columns or just expand.
    // Given the constraints, I'll allow adding a row. Adding columns to a fixed A4 schema is risky.
    alert("Official FF Academics format follows 4 columns. You can manually adjust widths instead.");
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-");
    if (!year || !month || !day) return dateStr;
    return `${day}/${month}/${year}`;
  };

  const getDatesForWeek = (weekStr: string) => {
    const weekNum = parseInt(weekStr.replace("Week ", ""));
    if (isNaN(weekNum)) return null;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); 
    
    // Find first Monday of the current month
    let date = new Date(year, month, 1);
    while (date.getDay() !== 1) { 
      date.setDate(date.getDate() + 1);
    }
    
    // Calculate Monday of target week
    const start = new Date(year, month, date.getDate() + (weekNum - 1) * 7);
    const end = new Date(year, month, start.getDate() + 4);
    
    return {
      from: start.toISOString().split('T')[0],
      to: end.toISOString().split('T')[0]
    };
  };

  const handleWeekChange = (week: string) => {
    const dates = getDatesForWeek(week);
    if (dates) {
      setForm(prev => ({
        ...prev,
        week,
        dateFrom: dates.from,
        dateTo: dates.to
      }));
    } else {
      handleChange("week", week);
    }
  };

  const toggleBorder = (side: 'top' | 'bottom' | 'left' | 'right') => {
    if (!activeCell) return;
    const key = `${activeCell.section}-${activeCell.row}-${activeCell.col}`;
    setCellBorders(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [side]: !prev[key]?.[side]
      }
    }));
  };

  const handleExportPDF = async () => {
    // Explicitly blur any currently edited cell to force state sync
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    
    setActiveCell(null);
    await new Promise(r => setTimeout(r, 250)); // Wait for render and sync
    if (!printRef.current) return;
    
    const element = printRef.current;
    
    // Configure html2pdf with high fidelity settings
    const opt: any = {
      margin: 0, 
      filename: `Lesson_Plan_${form.subject}_${form.week}.pdf`,
      image: { type: 'jpeg' as const, quality: 1.0 },
      html2canvas: { 
        scale: 4, // Ultra-fidelity for professional printing
        useCORS: true, 
        logging: false,
        letterRendering: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      },
      jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    try {
      await html2pdf().from(element).set(opt).save();
    } catch (err) {
      console.error("PDF Export failed:", err);
      setError("Failed to export PDF. Try again or check for large images.");
    }
  };

  const handleExportWord = async () => {
    setActiveCell(null);
    await new Promise(r => setTimeout(r, 100));
    if (!printRef.current) return;
    
    // We'll use the MHTML approach which is much better supported for "Word" exports in browser
    // and preserves layout better than simple HTML blobs.
    const header = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <meta charset='utf-8'>
        <style>
          @page { size: 21cm 29.7cm; margin: 1in; }
          body { font-family: 'Times New Roman', serif; }
          table { border-collapse: collapse; width: 100%; border: 1pt solid black; }
          th, td { border: 1pt solid black; padding: 6pt; vertical-align: top; }
          .font-bold { font-weight: bold; }
          .italic { font-style: italic; }
          .text-center { text-align: center; }
        </style>
      </head>
      <body>
    `;
    
    // Remove interactive elements
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = printRef.current.innerHTML;
    tempDiv.querySelectorAll('.lp-resizer').forEach(el => el.remove());
    tempDiv.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
    
    const footer = "</body></html>";
    const source = header + tempDiv.innerHTML + footer;
    
    const blob = new Blob(['\ufeff', source], {
      type: 'application/msword'
    });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Weekly_Lesson_Plan_${form.subject}_${form.week}.doc`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJPG = async () => {
    setActiveCell(null);
    await new Promise(r => setTimeout(r, 150));
    if (!printRef.current) return;

    try {
      const element = printRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
        onclone: (clonedDoc) => {
          const noPrint = clonedDoc.querySelectorAll('.no-print');
          noPrint.forEach(el => (el as HTMLElement).style.display = 'none');
          const resizers = clonedDoc.querySelectorAll('.lp-resizer');
          resizers.forEach(el => (el as HTMLElement).style.display = 'none');
        }
      });

      const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `Weekly_Lesson_Plan_${form.subject}_${form.week}.jpg`;
      link.click();
    } catch (err) {
      console.error("Export to JPG failed:", err);
      setError("Failed to export as image. Please ensure the content is loaded correctly.");
    }
  };

  const handleLectureExportPDF = async () => {
    if (!lectureRef.current || !lectureScript) return;
    
    // Explicitly blur any currently edited cell or focused element
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    
    setLectureExportMenuOpen(false);
    // Increase delay to ensure menu animation and blur are fully settled
    await new Promise(r => setTimeout(r, 400));
    
    const element = lectureRef.current;
    
    // Configure html2pdf with high fidelity settings matching the main plan
    const opt: any = {
      margin: 10, // 10mm margins for the lecture document
      filename: `Lecture_${lectureScript.title.replace(/[^a-z0-9]/gi, '_').substring(0, 30)}_P${activePeriodForLecture + 1}.pdf`,
      image: { type: 'jpeg' as const, quality: 1.0 },
      html2canvas: { 
        scale: 2, // Scale 2 is usually more robust for long documents
        useCORS: true, 
        logging: true,
        letterRendering: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      },
      jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    try {
      await html2pdf().from(element).set(opt).save();
    } catch (err) {
      console.error("PDF Export failed:", err);
      setError("Failed to export PDF. Please try again.");
    }
  };

  const handleLectureExportJPG = async () => {
    if (!lectureRef.current || !lectureScript) return;
    
    setLectureExportMenuOpen(false);
    await new Promise(r => setTimeout(r, 400));

    try {
      const element = lectureRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: true,
        allowTaint: true,
        backgroundColor: "#ffffff"
      });

      const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `Lecture_${lectureScript.title.replace(/[^a-z0-9]/gi, '_').substring(0, 30)}_P${activePeriodForLecture + 1}.jpg`;
      link.click();
    } catch (err) {
      console.error("JPG Export failed:", err);
      setError("Failed to export Image. Ensure content is fully loaded.");
    }
  };

  const handleLectureExportWord = async () => {
    if (!lectureRef.current || !lectureScript) return;
    
    setLectureExportMenuOpen(false);
    await new Promise(r => setTimeout(r, 400));
    
    const header = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
          </w:WordDocument>
        </xml>
        <![endif]-->
        <meta charset='utf-8'>
        <style>
          @page { size: 21cm 29.7cm; margin: 1in; }
          body { font-family: Arial, sans-serif; font-size: 12pt; }
          .font-bold { font-weight: bold; }
          .uppercase { text-transform: uppercase; }
          .text-center { text-align: center; }
          .italic { font-style: italic; }
          p { margin: 0 0 10pt 0; }
        </style>
      </head>
      <body>
    `;
    
    const source = header + lectureRef.current.innerHTML + "</body></html>";
    const blob = new Blob(['\ufeff', source], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Lecture_${lectureScript.title.replace(/\s+/g, '_').substring(0, 30)}_P${activePeriodForLecture + 1}.doc`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyLectureToClipboard = () => {
    if (!lectureScript) return;
    
    const text = `
LECTURE TITLE: ${lectureScript.title.toUpperCase()}
SUBJECT: ${form.subject}
CLASS: ${form.className}
PERIOD: ${activePeriodForLecture + 1}

--- INTRODUCTION / HOOK ---
${lectureScript.introduction}

--- CORE CONTENT ---
${lectureScript.lecturePoints.map((p, i) => `${i + 1}. ${p.topic}\n${p.script}`).join('\n\n')}

--- KEY QUESTIONS ---
${lectureScript.keyQuestions.map(q => `? ${q}`).join('\n')}

--- SUMMARY ---
${lectureScript.summary}
    `.trim();

    navigator.clipboard.writeText(text);
    setSuccess("Lecture script copied to clipboard!");
    setTimeout(() => setSuccess(""), 3000);
  };

  const handleGenerateLecture = async (periodIndex: number) => {
    if (!plan) {
      setError("No lesson plan loaded. Please generate or load a plan first.");
      return;
    }
    if (!plan.periods || !plan.periods[periodIndex]) {
      setError(`Could not find data for Period ${periodIndex + 1}.`);
      return;
    }

    setGeneratingLecture(true);
    setLectureScript(null);
    try {
      const script = await generateLectureScript(
        form.subject,
        form.className,
        form.chapter,
        plan.periods[periodIndex]
      );
      setLectureScript(script);
      setActivePeriodForLecture(periodIndex);
      setActiveView('lecture');
    } catch (err: any) {
      setError(err.message || "Failed to generate lecture script. Please try again.");
      console.error("Lecture generation error:", err);
    } finally {
      setGeneratingLecture(false);
    }
  };

  const handleShare = async () => {
    if (!plan) return;
    setSharing(true);
    setShareUrl(null);
    
    // Check if we are in dev environment to warn user
    const isDev = window.location.hostname.includes('-dev-');
    
    try {
      const id = await sharePlan(form, plan);
      const baseUrl = isDev ? 'https://ais-pre-fxkzkpoechizddn5swevx5-374315969837.asia-east1.run.app' : window.location.origin + window.location.pathname;
      const url = `${baseUrl}?share=${id}`;
      setShareUrl(url);
      
      if (isDev) {
        setError("Note: You are in Dev mode. We've generated a link to the Shared App for you.");
      }
      
      setSuccess("Lesson plan shared! Copy the link below.");
    } catch (err: any) {
      setError(err.message || "Failed to share plan.");
    } finally {
      setSharing(false);
    }
  };

  const handleArchive = async () => {
    if (!plan) return;
    setArchiving(true);
    setSuccess("");
    setError("");
    try {
      await archivePlan(form, plan);
      const updated = await getArchivedPlans();
      setArchivedPlans(updated);
      setSuccess("Plan successfully saved to your archives!");
    } catch (err: any) {
      setError(err.message || "Failed to archive plan.");
    } finally {
      setArchiving(false);
    }
  };

  const handleDeleteArchived = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this archived plan?")) return;
    try {
      await deleteArchivedPlan(id);
      setArchivedPlans(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      setError("Failed to delete archived plan.");
    }
  };

  const handleLoadArchive = (archived: SharedPlan) => {
    setForm(archived.form);
    setPlan(archived.plan);
    setShowArchives(false);
    setSuccess(`Archived plan for ${archived.form.subject} loaded!`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const copyShareLink = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setSuccess("Link copied to clipboard!");
      setTimeout(() => setSuccess(""), 3000);
    }
  };

  if (activeView === 'lecture' && lectureScript) {
    return (
      <div id="lecture-page" className="min-h-screen bg-white font-sans">
        <nav className="no-print sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-natural-border px-4 sm:px-8 py-4 flex items-center justify-between">
          <button 
            onClick={() => setActiveView('builder')}
            className="flex items-center gap-1.5 text-natural-ink-light dark:text-natural-ink-light-dark hover:text-natural-ink dark:hover:text-natural-ink-dark transition-colors font-bold text-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Back</span>
          </button>
          <div className="flex items-center gap-2 sm:gap-4">
            <button 
              onClick={copyLectureToClipboard}
              className="no-print flex items-center gap-1.5 px-3 py-1.5 text-natural-ink-light dark:text-natural-ink-light-dark hover:text-natural-ink dark:hover:text-natural-ink-dark transition-colors font-bold text-xs"
            >
              <Copy className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Copy Text</span>
            </button>
            
            <div className="relative">
              <button 
                onClick={() => setLectureExportMenuOpen(!lectureExportMenuOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-natural-ink dark:bg-natural-ink-dark text-white dark:text-natural-ink rounded-full font-bold shadow-md hover:bg-natural-ink/90 dark:hover:bg-natural-ink-dark/90 hover:-translate-y-0.5 transition-all text-xs group"
              >
                <Download className="w-3.5 h-3.5 group-hover:animate-bounce" />
                Export
                <ChevronDown className={`w-3 h-3 transition-transform duration-300 ${lectureExportMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {lectureExportMenuOpen && (
                  <>
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setLectureExportMenuOpen(false)}
                      className="fixed inset-0 z-40"
                    />
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-natural-paper-dark rounded-2xl shadow-2xl border border-natural-border dark:border-natural-border-dark p-2 z-50 flex flex-col gap-1 overflow-hidden transition-colors"
                    >
                      <button 
                        onClick={() => { window.print(); setLectureExportMenuOpen(false); }}
                        className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-natural-sage/10 rounded-xl transition-colors group"
                      >
                        <div className="w-8 h-8 bg-natural-sage/10 rounded-lg flex items-center justify-center text-natural-sage group-hover:bg-natural-sage group-hover:text-white transition-all">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-natural-ink dark:text-natural-ink-dark">Print View</span>
                          <span className="text-[10px] text-natural-ink-light dark:text-natural-ink-light-dark">System print dialog</span>
                        </div>
                      </button>

                      <button 
                        onClick={handleLectureExportPDF}
                        className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-natural-clay/10 rounded-xl transition-colors group"
                      >
                        <div className="w-8 h-8 bg-natural-clay/10 rounded-lg flex items-center justify-center text-natural-clay group-hover:bg-natural-clay group-hover:text-white transition-all">
                          <FileDown className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-natural-ink dark:text-natural-ink-dark">Export as PDF</span>
                          <span className="text-[10px] text-natural-ink-light dark:text-natural-ink-light-dark">A4 Document</span>
                        </div>
                      </button>

                      <button 
                        onClick={handleLectureExportJPG}
                        className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-natural-sage/10 rounded-xl transition-colors group"
                      >
                        <div className="w-8 h-8 bg-natural-sage/10 rounded-lg flex items-center justify-center text-natural-sage group-hover:bg-natural-sage group-hover:text-white transition-all">
                          <ImageIcon className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-natural-ink dark:text-natural-ink-dark">Export as JPG</span>
                          <span className="text-[10px] text-natural-ink-light dark:text-natural-ink-light-dark">Classroom Asset</span>
                        </div>
                      </button>

                      <button 
                        onClick={handleLectureExportWord}
                        className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-natural-ink/5 dark:hover:bg-natural-ink-dark/10 rounded-xl transition-colors group"
                      >
                        <div className="w-8 h-8 bg-natural-ink/10 dark:bg-natural-ink-dark/20 rounded-lg flex items-center justify-center text-natural-ink dark:text-natural-ink-dark group-hover:bg-natural-ink dark:group-hover:bg-natural-ink-dark group-hover:text-white transition-all">
                          <FileWord className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-natural-ink dark:text-natural-ink-dark">Export as Word</span>
                          <span className="text-[10px] text-natural-ink-light dark:text-natural-ink-light-dark">Editable Text</span>
                        </div>
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </nav>

        <main className="max-w-3xl mx-auto py-6 sm:py-12 px-4 sm:px-8">
          <div ref={lectureRef} className="space-y-6 sm:space-y-8 bg-white dark:bg-natural-paper-dark text-black dark:text-natural-ink-dark p-6 sm:p-10 shadow-xl border border-natural-border dark:border-natural-border-dark transition-colors print:bg-white print:text-black print:p-0 print:shadow-none print:border-none">
            {/* Header Info */}
            <div className="text-center space-y-2 pb-6 sm:pb-8 border-b border-black dark:border-natural-border-dark">
              <h1 className="text-xl sm:text-3xl font-bold uppercase">{lectureScript.title}</h1>
              <div className="text-[10px] sm:text-sm font-bold flex flex-wrap justify-center gap-2 sm:gap-6">
                <span>SUBJECT: {form.subject}</span>
                <span>CLASS: {form.className}</span>
                <span>PERIOD: {activePeriodForLecture + 1}</span>
              </div>
            </div>

            {/* Introduction */}
            <div className="py-4">
              <p className="font-bold uppercase text-sm mb-2 text-natural-ink-light dark:text-natural-ink-light-dark">LECTURE INTRODUCTION / HOOK:</p>
              <p className="text-lg leading-relaxed">{lectureScript.introduction}</p>
            </div>

            {/* Lecture Points */}
            <div className="space-y-8">
              <p className="font-bold uppercase text-sm border-b border-black dark:border-natural-border-dark pb-1 text-natural-ink-light dark:text-natural-ink-light-dark">CORE LECTURE CONTENT:</p>
              {lectureScript.lecturePoints.map((point, i) => (
                <div key={i} className="space-y-2">
                  <p className="font-bold uppercase text-sm text-natural-sage">{i + 1}. {point.topic}</p>
                  <p className="text-base leading-relaxed pl-4 border-l-2 border-natural-border dark:border-natural-border-dark italic">
                    {point.script}
                  </p>
                </div>
              ))}
            </div>

            {/* Engagement */}
            <div className="space-y-4 pt-6">
              <p className="font-bold uppercase text-sm border-b border-black dark:border-natural-border-dark pb-1 text-natural-ink-light dark:text-natural-ink-light-dark">CHECK FOR UNDERSTANDING / QUESTIONS:</p>
              <ul className="space-y-3 pl-5 list-disc">
                {lectureScript.keyQuestions.map((q, i) => (
                  <li key={i} className="text-base leading-relaxed italic">
                    {q}
                  </li>
                ))}
              </ul>
            </div>

            {/* Conclusion */}
            <div className="pt-8 border-t border-black dark:border-natural-border-dark">
              <p className="font-bold uppercase text-sm mb-2 text-natural-ink-light dark:text-natural-ink-light-dark">LECTURE SUMMARY & WRAP-UP:</p>
              <p className="text-base leading-relaxed italic bg-[#F7F5EF] dark:bg-natural-bg-dark/50 p-4 rounded-lg print:bg-transparent print:p-0">
                {lectureScript.summary}
              </p>
            </div>
          </div>
        </main>

        <footer className="no-print pb-8 sm:pb-12 text-center">
          <p className="text-natural-ink-light text-[10px] font-bold tracking-[0.3em] uppercase">
            Plain Text Classroom Resource
          </p>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-natural-bg dark:bg-natural-bg-dark transition-colors duration-300">
      {/* Header */}
      <header className="no-print bg-natural-paper dark:bg-natural-paper-dark border-b border-natural-border dark:border-natural-border-dark px-4 py-6 sm:px-8 sm:py-8 flex flex-col md:flex-row items-center md:items-end justify-between gap-6 transition-colors duration-300">
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 sm:gap-6 text-center sm:text-left">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-natural-sage rounded-2xl flex items-center justify-center shadow-natural">
            <GraduationCap className="text-white w-7 h-7 sm:w-9 sm:h-9" />
          </div>
          <div>
            <h1 className="font-serif text-natural-ink dark:text-natural-ink-dark text-2xl sm:text-4xl italic font-bold tracking-tight leading-tight">Weekly Lesson Plan Pro</h1>
            <p className="text-natural-ink-light dark:text-natural-ink-light-dark text-[10px] sm:text-sm font-medium uppercase tracking-[0.1em] mt-1 sm:mt-2">FF Academics Edition</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center justify-center md:justify-end gap-2 sm:gap-4 w-full md:w-auto">
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2.5 bg-natural-paper dark:bg-natural-paper-dark border border-natural-border dark:border-natural-border-dark rounded-full text-natural-clay shadow-sm hover:shadow-md transition-all"
            title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {plan && (
            <div className="flex items-center gap-2">
              <button 
                onClick={handleShare}
                disabled={sharing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-natural-paper-dark border border-natural-border dark:border-natural-border-dark rounded-full font-bold text-natural-ink dark:text-natural-ink-dark text-xs shadow-sm hover:shadow-md transition-all disabled:opacity-50"
                title="Create a shareable link"
              >
                <Share2 className={`w-3.5 h-3.5 ${sharing ? 'animate-pulse' : ''}`} />
                {sharing ? "Sharing..." : "Share"}
              </button>

              <button 
                onClick={handleArchive}
                disabled={archiving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-natural-paper-dark border border-natural-border dark:border-natural-border-dark rounded-full font-bold text-natural-ink dark:text-natural-ink-dark text-xs shadow-sm hover:shadow-md transition-all disabled:opacity-50"
                title="Save current plan to your archives"
              >
                <Archive className={`w-3.5 h-3.5 ${archiving ? 'animate-pulse' : ''}`} />
                {archiving ? "Archiving..." : "Save"}
              </button>
            </div>
          )}
          
          <button 
            onClick={() => setShowArchives(!showArchives)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-natural-sage/10 dark:bg-natural-sage/20 text-natural-sage border border-natural-sage/20 dark:border-natural-sage/30 rounded-full font-bold text-xs hover:bg-natural-sage/20 dark:hover:bg-natural-sage/30 transition-all"
            title="View your saved plans"
          >
            <History className="w-3.5 h-3.5" />
            {archivedPlans.length > 0 && (
              <span className="w-4 h-4 bg-natural-sage text-white text-[9px] rounded-full flex items-center justify-center">
                {archivedPlans.length}
              </span>
            )}
            Saved
          </button>

          <button 
            onClick={() => setIsEditing(!isEditing)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-xs transition-all shadow-sm ${
              isEditing 
                ? "bg-natural-sage text-white shadow-md" 
                : "bg-white dark:bg-natural-paper-dark border border-natural-border dark:border-natural-border-dark text-natural-ink-light dark:text-natural-ink-light-dark"
            }`}
          >
            {isEditing ? <LockOpen className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            {isEditing ? "Unlocked" : "Locked"}
          </button>

          <button 
            onClick={handleNew}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-natural-ink text-white rounded-full font-bold text-xs shadow-natural hover:shadow-md transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" /> New Plan
          </button>

          {plan && (
            <div className="relative">
              <button 
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-natural-ink text-white rounded-full font-bold shadow-natural hover:shadow-md transition-all text-xs group"
              >
                <Download className="w-3.5 h-3.5 group-hover:animate-bounce" />
                Export
                <ChevronDown className={`w-3 h-3 transition-transform duration-300 ${exportMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {exportMenuOpen && (
                  <>
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setExportMenuOpen(false)}
                      className="fixed inset-0 z-40"
                    />
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-natural-paper-dark rounded-2xl shadow-2xl border border-natural-border dark:border-natural-border-dark p-2 z-50 flex flex-col gap-1 overflow-hidden transition-colors"
                    >
                      <button 
                        onClick={() => { handleExportPDF(); setExportMenuOpen(false); }}
                        className="flex items-center gap-3 w-full px-4 py-2 text-left hover:bg-natural-clay/10 rounded-xl transition-colors group"
                      >
                        <div className="w-8 h-8 bg-natural-clay/10 rounded-lg flex items-center justify-center text-natural-clay group-hover:bg-natural-clay group-hover:text-white transition-all">
                          <FileDown className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-natural-ink dark:text-natural-ink-dark">Export as PDF</span>
                          <span className="text-[10px] text-natural-ink-light dark:text-natural-ink-light-dark">Professional printing</span>
                        </div>
                      </button>

                      <button 
                        onClick={() => { handleExportJPG(); setExportMenuOpen(false); }}
                        className="flex items-center gap-3 w-full px-4 py-2 text-left hover:bg-natural-sage/10 rounded-xl transition-colors group"
                      >
                        <div className="w-8 h-8 bg-natural-sage/10 rounded-lg flex items-center justify-center text-natural-sage group-hover:bg-natural-sage group-hover:text-white transition-all">
                          <ImageIcon className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-natural-ink dark:text-natural-ink-dark">Export as JPG</span>
                          <span className="text-[10px] text-natural-ink-light dark:text-natural-ink-light-dark">High-quality image</span>
                        </div>
                      </button>

                      <button 
                        onClick={() => { handleExportWord(); setExportMenuOpen(false); }}
                        className="flex items-center gap-3 w-full px-4 py-2 text-left hover:bg-natural-ink/5 dark:hover:bg-natural-ink-dark/10 rounded-xl transition-colors group"
                      >
                        <div className="w-8 h-8 bg-natural-ink/10 dark:bg-natural-ink-dark/20 rounded-lg flex items-center justify-center text-natural-ink dark:text-natural-ink-dark group-hover:bg-natural-ink dark:group-hover:bg-natural-ink-dark group-hover:text-white transition-all">
                          <FileWord className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-sm text-natural-ink dark:text-natural-ink-dark">Export as Word</span>
                          <span className="text-[10px] text-natural-ink-light dark:text-natural-ink-light-dark">Editable .doc file</span>
                        </div>
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-[1240px] mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {shareUrl && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-6 bg-natural-sage/5 dark:bg-natural-sage/10 border border-natural-sage/20 dark:border-natural-sage/30 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-6 transition-colors"
          >
            <div className="flex items-center gap-4 flex-1 w-full">
              <div className="hidden sm:flex w-12 h-12 bg-white dark:bg-natural-paper-dark rounded-xl items-center justify-center text-natural-sage shadow-sm border border-natural-sage/10 dark:border-natural-sage/20 shrink-0">
                <Link className="w-6 h-6" />
              </div>
              <div className="text-left flex-1 min-w-0">
                <p className="font-serif italic text-lg text-natural-ink dark:text-natural-ink-dark">Public shareable link is ready</p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-[10px] text-natural-ink-light dark:text-natural-ink-light-dark font-mono truncate bg-white/50 dark:bg-natural-paper-dark/50 px-2 py-1 rounded border border-natural-border/50 dark:border-natural-border-dark/50 flex-1">
                    {shareUrl}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
              <div className="bg-white dark:bg-white p-1 rounded-xl shadow-sm border border-natural-border/50 shrink-0">
                <QRCodeSVG value={shareUrl} size={128} level="H" includeMargin={true} />
              </div>

              <button 
                onClick={copyShareLink}
                className="px-6 py-3 bg-natural-sage text-white rounded-full font-bold flex items-center gap-2 hover:bg-natural-sage/80 transition-colors shrink-0 text-sm whitespace-nowrap"
              >
                <Copy className="w-4 h-4" /> Copy Link
              </button>
            </div>
          </motion.div>
        )}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="no-print bg-natural-paper dark:bg-natural-paper-dark rounded-[32px] border border-natural-border dark:border-natural-border-dark p-20 text-center shadow-natural"
            >
              <div className="flex justify-center mb-10">
                <div className="relative">
                  <div className="w-24 h-24 border-4 border-natural-bg dark:border-natural-border-dark border-t-natural-sage rounded-full animate-spin"></div>
                  <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-natural-sage w-10 h-10" />
                </div>
              </div>
              <h3 className="font-serif italic text-3xl text-natural-ink dark:text-natural-ink-dark mb-4">AI Expert Drafting SLOs...</h3>
              <p className="text-natural-ink-light dark:text-natural-ink-light-dark text-base max-w-sm mx-auto leading-relaxed">
                We're analyzing your textbook content to create sequential Student Learning Objectives and targeted assessments.
              </p>
              <div className="mt-12 h-1 w-64 mx-auto bg-natural-bg rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: "0%" }}
                  animate={{ width: "95%" }}
                  transition={{ duration: 10, ease: "easeInOut" }}
                  className="h-full bg-natural-sage rounded-full"
                />
              </div>
            </motion.div>
          ) : !plan ? (
            <motion.div
              key="form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8 no-print"
            >
              {/* Step 1: Identity */}
              <section className="bg-natural-paper dark:bg-natural-paper-dark rounded-[24px] shadow-natural border border-natural-border dark:border-natural-border-dark overflow-hidden transition-colors">
                <div className="border-b border-natural-border dark:border-natural-border-dark px-4 sm:px-8 py-4 sm:py-5">
                  <h2 className="text-natural-clay font-serif italic text-xl sm:text-2xl">School Identity</h2>
                </div>
                <div className="p-4 sm:p-8 grid md:grid-cols-2 gap-6 sm:gap-10">
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-natural-ink-light dark:text-natural-ink-light-dark uppercase tracking-widest flex items-center gap-2">
                       School Name
                    </label>
                    <input 
                      type="text" 
                      value={form.schoolName}
                      onChange={(e) => handleChange("schoolName", e.target.value)}
                      className="w-full bg-natural-bg dark:bg-natural-bg-dark border border-natural-border dark:border-natural-border-dark rounded-xl px-4 py-3.5 focus:border-natural-sage focus:outline-none transition-all font-medium text-natural-ink dark:text-natural-ink-dark"
                      placeholder="Enter school name..."
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-natural-ink-light dark:text-natural-ink-light-dark uppercase tracking-widest">Logo (Optional)</label>
                    <div 
                      onClick={() => logoInputRef.current?.click()}
                      className="h-[68px] border-2 border-dashed border-natural-border dark:border-natural-border-dark rounded-xl bg-natural-bg dark:bg-natural-bg-dark flex items-center justify-center cursor-pointer hover:border-natural-sage hover:bg-natural-sage/5 transition-all group"
                    >
                      {logoUrl ? (
                        <img src={logoUrl} alt="Logo" className="h-10 object-contain" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="flex items-center gap-3 text-natural-ink-light/50 dark:text-natural-ink-light-dark/50 group-hover:text-natural-sage transition-colors">
                          <Upload className="w-5 h-5" />
                          <span className="text-sm font-semibold">Upload Header Logo</span>
                        </div>
                      )}
                    </div>
                    <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogo} className="hidden" />
                  </div>
                </div>
              </section>

              {/* Step 2: Metadata */}
              <section className="bg-natural-paper dark:bg-natural-paper-dark rounded-[24px] shadow-natural border border-natural-border dark:border-natural-border-dark overflow-hidden transition-colors">
                <div className="border-b border-natural-border dark:border-natural-border-dark px-4 sm:px-8 py-4 sm:py-5">
                  <h2 className="text-natural-clay font-serif italic text-xl sm:text-2xl">Plan Configuration</h2>
                </div>
                <div className="p-4 sm:p-8 space-y-6 sm:space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-natural-ink-light dark:text-natural-ink-light-dark uppercase tracking-widest flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-natural-clay" /> Week
                      </label>
                      <select 
                        value={form.week} 
                        onChange={(e) => handleWeekChange(e.target.value)} 
                        className="w-full bg-natural-bg dark:bg-natural-bg-dark border border-natural-border dark:border-natural-border-dark text-natural-ink dark:text-natural-ink-dark rounded-xl px-4 py-3 focus:border-natural-sage focus:outline-none appearance-none cursor-pointer"
                      >
                        <option value="">Select Week</option>
                        {["Week 1", "Week 2", "Week 3", "Week 4", "Week 5"].map(w => (
                          <option key={w} value={w}>{w}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs font-bold text-natural-ink-light dark:text-natural-ink-light-dark uppercase tracking-widest flex items-center gap-2">
                        <ChevronRight className="w-3.5 h-3.5 text-natural-clay" /> Date Range
                      </label>
                      <div className="flex items-center gap-2">
                        <input type="date" value={form.dateFrom} onChange={(e) => handleChange("dateFrom", e.target.value)} className="w-full bg-natural-bg dark:bg-natural-bg-dark border border-natural-border dark:border-natural-border-dark rounded-xl px-3 py-3 focus:border-natural-sage focus:outline-none text-xs text-natural-ink dark:text-natural-ink-dark" />
                        <span className="text-natural-ink-light dark:text-natural-ink-light-dark">to</span>
                        <input type="date" value={form.dateTo} onChange={(e) => handleChange("dateTo", e.target.value)} className="w-full bg-natural-bg dark:bg-natural-bg-dark border border-natural-border dark:border-natural-border-dark rounded-xl px-3 py-3 focus:border-natural-sage focus:outline-none text-xs text-natural-ink dark:text-natural-ink-dark" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-natural-ink-light dark:text-natural-ink-light-dark uppercase tracking-widest flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-natural-clay" /> Count
                      </label>
                      <select value={form.numPeriods} onChange={(e) => handleChange("numPeriods", e.target.value)} className="w-full bg-natural-bg dark:bg-natural-bg-dark border border-natural-border dark:border-natural-border-dark text-natural-ink dark:text-natural-ink-dark rounded-xl px-4 py-3 focus:border-natural-sage focus:outline-none appearance-none cursor-pointer">
                        {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n.toString()}>{n} Pds</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-natural-ink-light dark:text-natural-ink-light-dark uppercase tracking-widest">Class</label>
                      <select value={form.className} onChange={(e) => handleChange("className", e.target.value)} className="w-full bg-natural-bg dark:bg-natural-bg-dark border border-natural-border dark:border-natural-border-dark text-natural-ink dark:text-natural-ink-dark rounded-xl px-4 py-3 focus:border-natural-sage focus:outline-none cursor-pointer">
                        <option value="">Select Class</option>
                        {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      {plan && lastGeneratedClass && form.className !== lastGeneratedClass && (
                        <p className="text-[10px] text-natural-clay font-bold flex items-center gap-1 mt-1 animate-pulse">
                          <AlertCircle className="w-3 h-3" /> Class changed. Click Generate again to adjust difficulty.
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-natural-ink-light dark:text-natural-ink-light-dark uppercase tracking-widest">Subject</label>
                      <select value={form.subject} onChange={(e) => handleChange("subject", e.target.value)} className="w-full bg-natural-bg dark:bg-natural-bg-dark border border-natural-border dark:border-natural-border-dark text-natural-ink dark:text-natural-ink-dark rounded-xl px-4 py-3 focus:border-natural-sage focus:outline-none cursor-pointer">
                        <option value="">Select Subject</option>
                        {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-natural-ink-light dark:text-natural-ink-light-dark uppercase tracking-widest">Page Numbers</label>
                      <input type="text" value={form.pageNos} onChange={(e) => handleChange("pageNos", e.target.value)} className="w-full bg-natural-bg dark:bg-natural-bg-dark border border-natural-border dark:border-natural-border-dark text-natural-ink dark:text-natural-ink-dark rounded-xl px-4 py-3 focus:border-natural-sage focus:outline-none transition-colors" placeholder="e.g. 52-64" />
                    </div>
                  </div>

                  <div className="space-y-5">
                    <label className="text-xs font-bold text-natural-ink-light dark:text-natural-ink-light-dark uppercase tracking-widest underline decoration-natural-sand underline-offset-8 decoration-2">Chapter & Topics</label>
                    <input type="text" value={form.chapter} onChange={(e) => handleChange("chapter", e.target.value)} className="w-full bg-natural-bg dark:bg-natural-bg-dark border border-natural-border dark:border-natural-border-dark text-natural-ink dark:text-natural-ink-dark rounded-xl px-4 py-4 focus:border-natural-sage focus:outline-none font-medium mb-2 text-lg transition-colors" placeholder="Chapter Name..." />
                    <input type="text" value={form.topics} onChange={(e) => handleChange("topics", e.target.value)} className="w-full bg-natural-bg dark:bg-natural-bg-dark border border-natural-border dark:border-natural-border-dark text-natural-ink dark:text-natural-ink-dark/80 rounded-xl px-4 py-3 focus:border-natural-sage focus:outline-none italic transition-all" placeholder="Main topics covered this week..." />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-natural-ink-light dark:text-natural-ink-light-dark uppercase tracking-widest">Teaching Aids</label>
                    <textarea value={form.teachingAids} onChange={(e) => handleChange("teachingAids", e.target.value)} className="w-full bg-natural-bg dark:bg-natural-bg-dark border border-natural-border dark:border-natural-border-dark text-natural-ink dark:text-natural-ink-dark rounded-xl px-4 py-3 focus:border-natural-sage focus:outline-none min-h-[60px] transition-colors" placeholder="Models, charts, multimedia..." />
                  </div>
                </div>
              </section>

              {/* Step 3: Source Hub (NotebookLM Inspired) */}
              <section className="bg-natural-paper dark:bg-natural-paper-dark rounded-[24px] shadow-natural border border-natural-border dark:border-natural-border-dark overflow-hidden transition-colors">
                <div className="border-b border-natural-border dark:border-natural-border-dark px-4 sm:px-8 py-4 sm:py-5 flex items-center justify-between bg-natural-bg/10 dark:bg-natural-bg-dark/10">
                  <div>
                    <h2 className="text-natural-clay font-serif italic text-xl sm:text-2xl">Source Hub</h2>
                    <p className="text-[10px] text-natural-ink-light dark:text-natural-ink-light-dark uppercase tracking-widest mt-1">Select resources to guide the AI</p>
                  </div>
                  <button 
                    onClick={() => setShowAddSourceModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-natural-sage text-white rounded-full font-bold text-xs hover:shadow-md transition-all shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Source
                  </button>
                </div>

                <div className="p-4 sm:p-8">
                  {sources.length === 0 ? (
                    <div 
                      onClick={() => setShowAddSourceModal(true)}
                      className="border-2 border-dashed border-natural-border dark:border-natural-border-dark rounded-[24px] p-12 text-center flex flex-col items-center gap-4 hover:bg-natural-bg/30 dark:hover:bg-natural-bg-dark/30 cursor-pointer transition-all group"
                    >
                      <div className="w-16 h-16 bg-white dark:bg-natural-paper-dark rounded-2xl shadow-sm flex items-center justify-center text-natural-clay group-hover:scale-110 transition-transform">
                        <Database className="w-8 h-8" />
                      </div>
                      <div className="max-w-xs">
                        <p className="text-xl font-serif italic text-natural-ink dark:text-natural-ink-dark mb-1">Your hub is empty</p>
                        <p className="text-natural-ink-light dark:text-natural-ink-light-dark text-sm">Add textbooks, websites, or notes to give the AI context for your plans.</p>
                      </div>
                      <button className="mt-2 px-8 py-3 bg-white dark:bg-natural-paper-dark border border-natural-border dark:border-natural-border-dark text-natural-ink dark:text-natural-ink-dark rounded-full font-bold hover:shadow-md transition-all text-sm">
                        Get Started
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {sources.map((source) => (
                        <div 
                          key={source.id}
                          className={`relative group border-2 rounded-[20px] p-4 transition-all cursor-pointer flex flex-col gap-3 ${
                            source.selected 
                              ? 'border-natural-sage bg-natural-sage/5 dark:bg-natural-sage/10 shadow-sm' 
                              : 'border-natural-border dark:border-natural-border-dark bg-white dark:bg-natural-paper-dark hover:border-natural-clay/30 dark:hover:border-natural-clay/50'
                          }`}
                          onClick={() => toggleSourceSelection(source.id)}
                        >
                          <div className="flex items-start justify-between">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                              source.type === 'file' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-500' :
                              source.type === 'link' ? 'bg-red-50 dark:bg-red-900/30 text-red-500' :
                              source.type === 'text' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-500' :
                              source.type === 'search' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-500' :
                              'bg-purple-50 dark:bg-purple-900/30 text-purple-500'
                            }`}>
                              {source.type === 'file' && (source.mimeType?.includes('image') ? <ImageIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />)}
                              {source.type === 'link' && (source.content.includes('youtube') ? <Video className="w-5 h-5" /> : <Globe className="w-5 h-5" />)}
                              {source.type === 'text' && <FileText className="w-5 h-5" />}
                              {source.type === 'search' && <Search className="w-5 h-5" />}
                              {source.type === 'drive' && <Cloud className="w-5 h-5" />}
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={(e) => { e.stopPropagation(); removeSource(source.id); }}
                                className="p-1.5 text-natural-ink-light dark:text-natural-ink-light-dark hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${source.selected ? 'bg-natural-sage border-natural-sage text-white' : 'border-natural-border dark:border-natural-border-dark bg-white dark:bg-natural-paper-dark'}`}>
                                {source.selected && <CheckCircle2 className="w-3 px-0 h-3" />}
                              </div>
                            </div>
                          </div>
                          
                          <div className="min-w-0">
                            <h4 className="font-bold text-natural-ink dark:text-natural-ink-dark text-sm truncate pr-2">{source.title}</h4>
                            <p className="text-[10px] text-natural-ink-light dark:text-natural-ink-light-dark uppercase tracking-widest mt-1">{source.type}</p>
                          </div>
                        </div>
                      ))}
                      
                      <button 
                        onClick={() => setShowAddSourceModal(true)}
                        className="border-2 border-dashed border-natural-border dark:border-natural-border-dark rounded-[20px] p-4 flex flex-col items-center justify-center gap-2 hover:bg-natural-bg/30 dark:hover:bg-natural-bg-dark/30 transition-all text-natural-clay"
                      >
                        <Plus className="w-6 h-6" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Add More</span>
                      </button>
                    </div>
                  )}

                  {/* Integration Trigger */}
                  <div className="mt-8 pt-8 border-t border-natural-border dark:border-natural-border-dark flex flex-col items-center gap-6">
                    {analyzing ? (
                        <div className="flex flex-col items-center gap-4 text-center">
                          <Loader2 className="w-12 h-12 text-natural-sage animate-spin" />
                          <div>
                            <p className="font-serif italic text-xl text-natural-ink dark:text-natural-ink-dark">Gemini 3 is synthesizing {sources.filter(s => s.selected).length} sources...</p>
                            <p className="text-natural-ink-light dark:text-natural-ink-light-dark text-sm">Mapping cross-resource data to your curriculum...</p>
                          </div>
                        </div>
                    ) : success && sources.length > 0 ? (
                        <div className="flex flex-col items-center gap-4 text-center">
                          <div className="w-16 h-16 bg-natural-sage/10 rounded-full flex items-center justify-center text-natural-sage mb-2 border-4 border-white dark:border-natural-paper-dark shadow-sm">
                            <CheckCircle2 className="w-8 h-8" />
                          </div>
                          <div>
                            <p className="text-xl font-serif italic text-natural-ink dark:text-natural-ink-dark mb-1">Context Synchronized</p>
                            <p className="text-natural-ink-light dark:text-natural-ink-light-dark text-sm">Selected sources are ready for generation.</p>
                          </div>
                          <div className="flex gap-4 mt-2">
                             <button 
                              onClick={handleGenerate}
                              className="px-10 py-3 bg-natural-sage text-white rounded-full font-bold shadow-natural hover:shadow-lg transition-all text-sm flex items-center gap-2"
                            >
                              <Sparkles className="w-5 h-5" /> Generate from Sources
                            </button>
                            <button 
                              onClick={() => setSuccess("")}
                              className="px-6 py-3 bg-white dark:bg-natural-paper-dark border border-natural-border dark:border-natural-border-dark text-natural-ink dark:text-natural-ink-dark rounded-full font-bold hover:shadow-md transition-all text-sm"
                            >
                              Refine Selection
                            </button>
                          </div>
                        </div>
                    ) : sources.length > 0 && (
                      <button 
                        onClick={analyzeSources}
                        className="px-12 py-4 bg-natural-sage text-white rounded-full font-bold shadow-natural hover:shadow-lg transition-all text-base flex items-center gap-2"
                      >
                        <Sparkles className="w-5 h-5" /> Synchronize {sources.filter(s => s.selected).length} Sources
                      </button>
                    )}
                  </div>
                </div>
              </section>

              {/* Add Source Modal */}
              <AnimatePresence>
                {showAddSourceModal && (
                  <>
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setShowAddSourceModal(false)}
                      className="fixed inset-0 bg-natural-ink/40 backdrop-blur-sm z-[200] no-print"
                    />
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: 20 }}
                      className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-white dark:bg-natural-paper-dark rounded-[32px] shadow-2xl z-[201] no-print overflow-hidden flex flex-col max-h-[90vh] transition-colors"
                    >
                      <div className="p-8 border-b border-natural-border dark:border-natural-border-dark flex items-center justify-between bg-natural-bg/5 dark:bg-natural-bg-dark/5">
                        <div>
                          <h2 className="text-2xl font-serif italic text-natural-ink dark:text-natural-ink-dark">Add Resources</h2>
                          <p className="text-xs text-natural-ink-light dark:text-natural-ink-light-dark uppercase tracking-widest mt-1">Populate your source hub</p>
                        </div>
                        <button onClick={() => setShowAddSourceModal(false)} className="p-2 hover:bg-natural-bg dark:hover:bg-natural-bg-dark rounded-full transition-colors text-natural-ink-light dark:text-natural-ink-light-dark">
                          <X className="w-6 h-6" />
                        </button>
                      </div>

                      <div className="flex bg-natural-bg/30 dark:bg-natural-bg-dark/30 p-2 gap-1 border-b border-natural-border dark:border-natural-border-dark">
                        {[
                          { id: 'file', icon: Upload, label: 'Files' },
                          { id: 'link', icon: Globe, label: 'Links' },
                          { id: 'drive', icon: Cloud, label: 'Drive' },
                          { id: 'text', icon: FileText, label: 'Paste' },
                          { id: 'search', icon: Search, label: 'Search' }
                        ].map((tab) => (
                          <button 
                            key={tab.id}
                            onClick={() => setActiveSourceTab(tab.id as any)}
                            className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all font-bold text-xs ${
                              activeSourceTab === tab.id 
                                ? 'bg-white dark:bg-natural-paper-dark shadow-sm text-natural-sage border border-natural-border dark:border-natural-border-dark' 
                                : 'text-natural-ink-light dark:text-natural-ink-light-dark hover:bg-white/50 dark:hover:bg-natural-bg-dark/50'
                            }`}
                          >
                            <tab.icon className="w-4 h-4" />
                            <span className="hidden sm:inline">{tab.label}</span>
                          </button>
                        ))}
                      </div>

                      <div className="p-8 overflow-y-auto">
                        <AnimatePresence mode="wait">
                          {activeSourceTab === 'file' && (
                            <motion.div key="file" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                              <input 
                                ref={fileInputRef} type="file" multiple className="hidden" accept=".pdf,.doc,.docx,.jpg,.png,.txt"
                                onChange={(e) => e.target.files && handleFilesAdded(e.target.files)}
                              />
                              <div 
                                onDragEnter={onDrag} onDragLeave={onDrag} onDragOver={onDrag} onDrop={onDrop}
                                className={`border-2 border-dashed rounded-[24px] p-12 text-center flex flex-col items-center gap-4 transition-all ${
                                  dragActive 
                                    ? 'border-natural-sage bg-natural-sage/5 scale-[0.99]' 
                                    : 'border-natural-border dark:border-natural-border-dark bg-natural-bg/10 dark:bg-natural-bg-dark/10 hover:border-natural-clay/30 dark:hover:border-natural-clay/50'
                                }`}
                                onClick={() => fileInputRef.current?.click()}
                              >
                                <div className="w-16 h-16 bg-white dark:bg-natural-paper-dark rounded-2xl shadow-sm flex items-center justify-center text-natural-clay mb-2">
                                  {analyzing ? <Loader2 className="w-8 h-8 animate-spin" /> : <Upload className="w-8 h-8" />}
                                </div>
                                <div>
                                  <p className="text-xl font-serif italic text-natural-ink dark:text-natural-ink-dark mb-1">Click or drag files here</p>
                                  <p className="text-natural-ink-light dark:text-natural-ink-light-dark text-sm max-w-xs mx-auto">Upload PDF textbook excerpts, Word docs, or images of textbook pages.</p>
                                </div>
                              </div>
                            </motion.div>
                          )}

                          {activeSourceTab === 'link' && (
                            <motion.div key="link" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                              <div className="space-y-4">
                                <p className="text-sm text-natural-ink-light dark:text-natural-ink-light-dark">Add a URL to a website or YouTube video for the AI to ingest.</p>
                                <div className="relative">
                                  <input 
                                    type="url" placeholder="https://example.com or youtube.com/watch..."
                                    className="w-full bg-natural-bg dark:bg-natural-bg-dark border border-natural-border dark:border-natural-border-dark rounded-2xl px-6 py-4 focus:border-natural-sage focus:outline-none pr-32 text-natural-ink dark:text-natural-ink-dark"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddLink((e.target as HTMLInputElement).value)}
                                  />
                                  <button onClick={(e) => handleAddLink((e.currentTarget.previousSibling as HTMLInputElement).value)} className="absolute right-3 top-1/2 -translate-y-1/2 px-6 py-2 bg-natural-sage text-white rounded-xl font-bold text-xs shadow-sm hover:shadow-md transition-all">
                                    Import
                                  </button>
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-natural-ink-light dark:text-natural-ink-light-dark font-bold uppercase tracking-widest pl-2">
                                  <Video className="w-3 h-3" /> YouTube Transcripts Supported
                                </div>
                              </div>
                            </motion.div>
                          )}

                          {activeSourceTab === 'drive' && (
                            <motion.div key="drive" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col items-center justify-center py-12 text-center">
                              <div className="w-24 h-24 bg-natural-bg dark:bg-natural-bg-dark rounded-[28px] flex items-center justify-center text-[#4285F4] mb-4 border border-natural-border dark:border-natural-border-dark shadow-sm">
                                <Cloud className="w-12 h-12" />
                              </div>
                              <h3 className="text-2xl font-serif italic text-natural-ink dark:text-natural-ink-dark mb-2">Google Drive</h3>
                              <p className="text-natural-ink-light dark:text-natural-ink-light-dark text-sm max-w-sm mb-8 leading-relaxed">Directly import documents from your school's shared drive or your personal storage.</p>
                              <button 
                                onClick={() => alert("Please initialize OAuth first.")}
                                className="px-10 py-4 bg-[#4285F4] text-white rounded-full font-bold shadow-lg hover:bg-[#357abd] transition-all flex items-center gap-3"
                              >
                                <Cloud className="w-5 h-5" /> Connect Google Account
                              </button>
                            </motion.div>
                          )}

                          {activeSourceTab === 'text' && (
                            <motion.div key="text" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
                              <p className="text-sm text-natural-ink-light dark:text-natural-ink-light-dark">Paste manual notes, curriculum snippets, or key definitions.</p>
                              <div className="objective-card-edge rounded-2xl overflow-hidden border border-natural-border dark:border-natural-border-dark bg-natural-bg/10 dark:bg-natural-bg-dark/10 p-2">
                                <textarea 
                                  value={manualText} onChange={(e) => setManualText(e.target.value)}
                                  className="w-full bg-white dark:bg-natural-paper-dark p-6 min-h-[200px] border-none focus:outline-none text-natural-ink dark:text-natural-ink-dark leading-relaxed italic rounded-xl"
                                  placeholder="E.g. Newton's second law states that the acceleration of an object as produced by a net force is directly proportional to the magnitude of the net force..."
                                />
                              </div>
                              <div className="flex justify-end">
                                <button onClick={handleAddPaste} className="px-8 py-3 bg-natural-sage text-white rounded-xl font-bold shadow-sm">
                                  Save Excerpt
                                </button>
                              </div>
                            </motion.div>
                          )}

                          {activeSourceTab === 'search' && (
                            <motion.div key="search" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                              <div className="relative">
                                <input 
                                  type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                  placeholder="Search for topic-specific educational resources..."
                                  className="w-full bg-natural-bg dark:bg-natural-bg-dark border border-natural-border dark:border-natural-border-dark rounded-2xl pl-12 pr-4 py-4 focus:border-natural-sage focus:outline-none text-natural-ink dark:text-natural-ink-dark"
                                />
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-natural-clay w-5 h-5" />
                                <button 
                                  onClick={handleSearch} disabled={isSearching}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 px-6 py-2 bg-natural-ink dark:bg-natural-ink-dark text-white dark:text-natural-ink rounded-xl text-xs font-bold disabled:opacity-50"
                                >
                                  {isSearching ? 'Searching...' : 'Search'}
                                </button>
                              </div>

                              {searchResults.length > 0 && (
                                <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                                  {searchResults.map((result, idx) => (
                                    <div 
                                      key={idx} 
                                      className="p-4 rounded-2xl border border-natural-border dark:border-natural-border-dark bg-white dark:bg-natural-paper-dark hover:bg-natural-bg/30 dark:hover:bg-natural-bg-dark/30 transition-all flex items-start justify-between gap-4"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <h4 className="font-bold text-natural-ink dark:text-natural-ink-dark text-sm mb-1">{result.title}</h4>
                                        <p className="text-xs text-natural-ink-light dark:text-natural-ink-light-dark line-clamp-2 italic">{result.snippet}</p>
                                        <div className="flex items-center gap-2 mt-2">
                                          <Globe className="w-3 h-3 text-natural-clay" />
                                          <span className="text-[10px] text-natural-sage font-mono truncate">{result.link}</span>
                                        </div>
                                      </div>
                                      <button 
                                        onClick={() => {
                                          addSource({ type: 'search', title: result.title, content: `${result.title}\n${result.snippet}\nLink: ${result.link}` });
                                          setShowAddSourceModal(false);
                                        }}
                                        className="shrink-0 p-2 bg-natural-sage/10 text-natural-sage rounded-xl hover:bg-natural-sage hover:text-white transition-all"
                                      >
                                        <Plus className="w-5 h-5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>

              {/* Step 4: Final Synthesis Context */}
              <section className="bg-natural-paper dark:bg-natural-paper-dark rounded-[24px] shadow-natural border border-natural-border dark:border-natural-border-dark overflow-hidden transition-colors">
                <div className="border-b border-natural-border dark:border-natural-border-dark px-4 sm:px-8 py-4 sm:py-5 bg-natural-bg/5 dark:bg-natural-bg-dark/5 text-natural-ink dark:text-natural-ink-dark transition-colors">
                  <h2 className="text-natural-clay font-serif italic text-xl sm:text-2xl flex items-center justify-between gap-2">
                    Manual Directives
                    <span className="text-[10px] font-sans not-italic uppercase tracking-widest text-natural-ink-light">Optional</span>
                  </h2>
                  <p className="text-[10px] text-natural-ink-light dark:text-natural-ink-light-dark uppercase tracking-widest mt-1">Extra instructions for the AI</p>
                </div>
                <div className="p-4 sm:p-8">
                  <div className="space-y-3">
                    <div className="objective-card-edge rounded-2xl bg-natural-bg/10 dark:bg-natural-bg-dark/10 border border-natural-border dark:border-natural-border-dark transition-colors">
                      <textarea 
                        value={form.content}
                        onChange={(e) => handleChange("content", e.target.value)}
                        className="w-full bg-transparent border-none focus:ring-0 focus:outline-none min-h-[160px] p-6 leading-relaxed text-natural-ink dark:text-natural-ink-dark italic transition-colors"
                        placeholder="Type any specific SLOs, activity ideas, or homework requirements here. These will take priority over extracted resources..."
                      />
                    </div>
                  </div>
                </div>
              </section>

              {error && (
                <div className="no-print bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-2xl p-5 flex items-center gap-3 text-red-700 dark:text-red-400 font-medium animate-pulse">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}

              <button 
                onClick={handleGenerate}
                loading={loading}
                disabled={loading}
                className={`w-full py-4 rounded-[40px] font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-4 active:scale-[0.98] ${
                  success 
                    ? "bg-natural-sage text-white hover:shadow-xl hover:-translate-y-0.5" 
                    : "bg-natural-ink dark:bg-natural-ink-dark text-white dark:text-natural-ink rounded-[40px] hover:shadow-xl hover:-translate-y-0.5"
                } ${loading ? "opacity-70 cursor-not-allowed" : ""}`}
              >
                {loading ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <Sparkles className={`w-6 h-6 ${success ? "text-white" : "text-natural-sand"}`} />
                )}
                {loading ? "Creating..." : success ? "Generate Plan Now" : "Generate Plan"}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              {error && (
                <div className="no-print bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-2xl p-5 flex items-center gap-3 text-red-700 dark:text-red-400 font-medium animate-pulse">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}
              <div className="no-print bg-natural-paper dark:bg-natural-paper-dark rounded-[24px] shadow-natural border border-natural-border dark:border-natural-border-dark p-6 flex flex-col sm:flex-row items-center justify-between gap-6 transition-colors">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setPlan(null)}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-natural-ink-light dark:text-natural-ink-light-dark hover:bg-natural-bg dark:hover:bg-natural-bg-dark hover:text-natural-ink dark:hover:text-natural-ink-dark transition-all active:scale-95 group"
                    title="Return to Builder"
                  >
                    <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
                  </button>
                  <div>
                    <h4 className="font-serif italic text-2xl text-natural-ink dark:text-natural-ink-dark font-bold leading-tight">{form.subject} Plan</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-natural-ink-light dark:text-natural-ink-light-dark text-sm uppercase tracking-widest">{form.week} • Draft for A4 Print</p>
                      {authorName && (
                        <span className="flex items-center gap-1.5 px-2.5 py-0.5 bg-natural-sage/10 text-natural-sage text-[10px] font-bold rounded-full border border-natural-sage/20 dark:border-natural-sage/30 uppercase tracking-tighter">
                          <GraduationCap className="w-3 h-3" /> Shared by {authorName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 relative no-print flex-wrap justify-end">
                  {/* Lecture Button */}
                  <div className="relative group/gen">
                    <button 
                      onClick={() => handleGenerateLecture(0)}
                      disabled={generatingLecture}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-natural-sage text-white rounded-full font-bold shadow-md hover:bg-natural-sage/90 hover:-translate-y-0.5 transition-all text-xs group"
                    >
                      {generatingLecture ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Mic2 className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                      )}
                      {generatingLecture ? "Preparing..." : "Lecture"}
                    </button>
                    
                    {/* If there are multiple periods, show a quick selection overlay on hover */}
                    {plan && (plan as WeeklyLessonPlan).periods.length > 1 && !generatingLecture && (
                      <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-natural-paper-dark rounded-2xl shadow-2xl border border-natural-border dark:border-natural-border-dark p-2 z-50 opacity-0 invisible group-hover/gen:opacity-100 group-hover/gen:visible transition-all">
                        <p className="text-[10px] text-natural-ink-light dark:text-natural-ink-light-dark px-2 py-1 uppercase font-bold tracking-widest border-b border-natural-border dark:border-natural-border-dark mb-1">Select Period</p>
                        {(plan as WeeklyLessonPlan).periods.map((_, i) => (
                          <button
                            key={i}
                            onClick={() => handleGenerateLecture(i)}
                            className="w-full text-left px-3 py-2 text-xs font-medium text-natural-ink dark:text-natural-ink-dark hover:bg-natural-sage/10 rounded-lg transition-colors flex items-center justify-between group/p"
                          >
                            Period {i + 1}
                            <Plus className="w-3 h-3 opacity-0 group-hover/p:opacity-100 transition-opacity" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* A4 PRINT VIEW */}
              <div className="w-full overflow-x-auto no-print shadow-xl rounded-[24px] border border-natural-border dark:border-natural-border-dark bg-white dark:bg-natural-paper-dark mb-8 transition-colors">
                <div ref={printRef} className="lp-print-container p-0 mx-auto bg-white min-w-[700px]">
                  <div className="flex justify-between items-center px-4 py-1.5 leading-none bg-white">
                    <div className="w-12">
                      {logoUrl && <img src={logoUrl} alt="Logo" className="h-12 object-contain" referrerPolicy="no-referrer" />}
                    </div>
                    <h2 className="font-bold underline text-base flex-1 text-center text-black">WEEKLY LESSON PLAN</h2>
                    <p className="text-[10pt] italic whitespace-nowrap text-black">Lesson Plan | FF Academics</p>
                  </div>

                {/* Floating Grid Controls */}
                <AnimatePresence>
                  {activeCell && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="no-print fixed bottom-4 right-4 sm:bottom-8 sm:right-8 z-50 bg-white dark:bg-natural-paper-dark shadow-2xl rounded-2xl border border-natural-border dark:border-natural-border-dark p-3 sm:p-4 flex flex-col gap-2 sm:gap-3 min-w-[180px] sm:min-w-[200px] grid-controls-menu max-h-[80vh] overflow-y-auto transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-natural-ink-light dark:text-natural-ink-light-dark">Grid Controls</span>
                        <button onClick={() => setActiveCell(null)} className="p-1 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-500 rounded-lg transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <button 
                          onClick={() => toggleBorder('top')}
                          className="flex items-center gap-2 px-3 py-2 bg-natural-bg dark:bg-natural-bg-dark text-natural-ink dark:text-natural-ink-dark rounded-lg text-[10px] font-bold hover:bg-natural-border dark:hover:bg-natural-border-dark transition-colors"
                        >
                          <Square className="w-3 h-3 rotate-0" /> Top Border
                        </button>
                        <button 
                          onClick={() => toggleBorder('bottom')}
                          className="flex items-center gap-2 px-3 py-2 bg-natural-bg dark:bg-natural-bg-dark text-natural-ink dark:text-natural-ink-dark rounded-lg text-[10px] font-bold hover:bg-natural-border dark:hover:bg-natural-border-dark transition-colors"
                        >
                          <Square className="w-3 h-3 rotate-180" /> Bottom Border
                        </button>
                        <button 
                          onClick={() => toggleBorder('left')}
                          className="flex items-center gap-2 px-3 py-2 bg-natural-bg dark:bg-natural-bg-dark text-natural-ink dark:text-natural-ink-dark rounded-lg text-[10px] font-bold hover:bg-natural-border dark:hover:bg-natural-border-dark transition-colors"
                        >
                          <Square className="w-3 h-3 -rotate-90" /> Left Border
                        </button>
                        <button 
                          onClick={() => toggleBorder('right')}
                          className="flex items-center gap-2 px-3 py-2 bg-natural-bg dark:bg-natural-bg-dark text-natural-ink dark:text-natural-ink-dark rounded-lg text-[10px] font-bold hover:bg-natural-border dark:hover:bg-natural-border-dark transition-colors"
                        >
                          <Square className="w-3 h-3 rotate-90" /> Right Border
                        </button>
                      </div>
                      
                      <div className="h-px bg-natural-border dark:bg-natural-border-dark my-1" />
                      
                      <div className="flex items-center gap-1 mb-1">
                        <button 
                          onClick={() => execFormatting('bold')}
                          className="p-2 hover:bg-natural-bg dark:hover:bg-natural-bg-dark rounded-lg text-natural-ink dark:text-natural-ink-dark transition-colors"
                          title="Bold"
                        >
                          <Bold className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => execFormatting('italic')}
                          className="p-2 hover:bg-natural-bg dark:hover:bg-natural-bg-dark rounded-lg text-natural-ink dark:text-natural-ink-dark transition-colors"
                          title="Italic"
                        >
                          <Italic className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => execFormatting('insertUnorderedList')}
                          className="p-2 hover:bg-natural-bg dark:hover:bg-natural-bg-dark rounded-lg text-natural-ink dark:text-natural-ink-dark transition-colors"
                          title="Bullet List"
                        >
                          <List className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => execFormatting('insertOrderedList')}
                          className="p-2 hover:bg-natural-bg dark:hover:bg-natural-bg-dark rounded-lg text-natural-ink dark:text-natural-ink-dark transition-colors"
                          title="Numbered List"
                        >
                          <ListOrdered className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="h-px bg-natural-border dark:bg-natural-border-dark my-1" />
                      
                      <button 
                        onClick={handleAddRow}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-natural-sage text-white rounded-lg text-[10px] font-bold hover:bg-natural-sage/90"
                      >
                        <Plus className="w-3 h-3" /> Add Row Here
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Reflection */}
                <div className="m-2 p-2 border border-black relative group text-[10pt]">
                  <p className="font-bold underline mb-2 text-center">
                    Reflection (To be filled on completion of the previous teaching week.)
                  </p>
                  <div 
                    contentEditable={isEditing}
                    suppressContentEditableWarning
                    className={`space-y-1 outline-none ${isEditing ? 'bg-yellow-50/30 p-1 rounded' : ''}`}
                  >
                    <p>Dates: <span className="underline">___________________</span></p>
                    <p>Completion status (Complete/ Incomplete): <span className="underline">___________________</span></p>
                    <p>Reason for Non-completion: <span className="underline italic">__________________________________________________________________________</span></p>
                    <p>Details of work to be carried forward (if any) – List down the incomplete objective(s): <span className="underline italic">__________________________________</span></p>
                  </div>
                  {isEditing && <Pencil className="absolute top-2 right-2 w-3 h-3 text-natural-clay/50" />}
                </div>

                {/* Info Table */}
                <div className="mx-2 border-x border-t border-black overflow-hidden text-[10pt] relative">
                  <table className="w-full text-left border-collapse">
                    <tbody>
                      <tr style={{ height: rowHeights[0] || 'auto' }} className="relative group">
                        <th className="bg-[#f3f4f6] px-2 py-1 border-b border-r border-black font-bold w-48">Week(as mentioned in SoS)</th>
                        <td 
                          className={`px-2 py-1 border-b border-r border-black outline-none hover:bg-yellow-50/10 ${activeCell?.section === 'info' && activeCell.row === 0 && activeCell.col === 0 ? 'lp-cell-active' : ''}`}
                        >
                          <div 
                            contentEditable={isEditing} 
                            onFocus={() => setActiveCell({ row: 0, col: 0, section: 'info' })}
                            onBlur={(e) => handleCellEdit('info', 0, 0, 'week', e.currentTarget.innerText)}
                            suppressContentEditableWarning
                            className="outline-none w-full h-full"
                          >
                            {form.week}
                          </div>
                        </td>
                        <th className="bg-[#f3f4f6] px-2 py-1 border-b border-r border-black font-bold w-20">Dates</th>
                        <td 
                          className={`px-2 py-1 border-b border-black outline-none hover:bg-yellow-50/10 relative ${activeCell?.section === 'info' && activeCell.row === 0 && activeCell.col === 1 ? 'lp-cell-active' : ''}`}
                        >
                          <div 
                            contentEditable={isEditing}
                            onFocus={() => setActiveCell({ row: 0, col: 1, section: 'info' })}
                            suppressContentEditableWarning
                            className="outline-none w-full h-full"
                          >
                            {formatDate(form.dateFrom)} - {formatDate(form.dateTo)}
                          </div>
                          {isEditing && <div className="no-print lp-resizer lp-row-resizer" onMouseDown={(e) => handleRowResize(0, e)} />}
                        </td>
                      </tr>
                      <tr style={{ height: rowHeights[1] || 'auto' }} className="relative group">
                        <th className="bg-[#f3f4f6] px-2 py-1 border-b border-r border-black font-bold">Class</th>
                        <td 
                          className={`px-2 py-1 border-b border-r border-black outline-none hover:bg-yellow-50/10 ${activeCell?.section === 'info' && activeCell.row === 1 && activeCell.col === 0 ? 'lp-cell-active' : ''}`}
                        >
                          <div 
                            contentEditable={isEditing}
                            onFocus={() => setActiveCell({ row: 1, col: 0, section: 'info' })}
                            onBlur={(e) => handleCellEdit('info', 1, 0, 'className', e.currentTarget.innerText)}
                            suppressContentEditableWarning
                            className="outline-none w-full h-full"
                          >
                            {form.className}
                          </div>
                        </td>
                        <th className="bg-[#f3f4f6] px-2 py-1 border-b border-r border-black font-bold w-20">Subject</th>
                        <td 
                          className={`px-2 py-1 border-b border-r border-black outline-none hover:bg-yellow-50/10 ${activeCell?.section === 'info' && activeCell.row === 1 && activeCell.col === 1 ? 'lp-cell-active' : ''}`}
                        >
                          <div 
                            contentEditable={isEditing}
                            onFocus={() => setActiveCell({ row: 1, col: 1, section: 'info' })}
                            onBlur={(e) => handleCellEdit('info', 1, 1, 'subject', e.currentTarget.innerText)}
                            suppressContentEditableWarning
                            className="outline-none w-full h-full"
                          >
                            {form.subject}
                          </div>
                        </td>
                        <th className="bg-[#f3f4f6] px-2 py-1 border-b border-r border-black font-bold w-24">No. of pds</th>
                        <td 
                          className={`px-2 py-1 border-b border-black outline-none hover:bg-yellow-50/10 relative ${activeCell?.section === 'info' && activeCell.row === 1 && activeCell.col === 2 ? 'lp-cell-active' : ''}`}
                        >
                          <div 
                            contentEditable={isEditing}
                            onFocus={() => setActiveCell({ row: 1, col: 2, section: 'info' })}
                            onBlur={(e) => handleCellEdit('info', 1, 2, 'numPeriods', e.currentTarget.innerText)}
                            suppressContentEditableWarning
                            className="outline-none w-full h-full"
                          >
                            {form.numPeriods}
                          </div>
                          {isEditing && <div className="no-print lp-resizer lp-row-resizer" onMouseDown={(e) => handleRowResize(1, e)} />}
                        </td>
                      </tr>
                      <tr>
                        <th className="bg-[#f3f4f6] px-2 py-1 border-b border-r border-black font-bold">Chapter</th>
                        <td colSpan={2} className={`px-2 py-1 border-b border-r border-black outline-none ${isEditing ? 'bg-yellow-50/30' : ''}`}>
                          <div 
                            contentEditable={isEditing} 
                            suppressContentEditableWarning 
                            className="outline-none"
                            onBlur={(e) => handleCellEdit('info', 2, 0, 'chapter', e.currentTarget.innerText)}
                          >
                            {form.chapter}
                          </div>
                        </td>
                        <th className="bg-[#f3f4f6] px-2 py-1 border-b border-r border-black font-bold underline">Textbook page nos.</th>
                        <td className={`px-2 py-1 border-b border-black outline-none ${isEditing ? 'bg-yellow-50/30' : ''}`}>
                          <div 
                            contentEditable={isEditing} 
                            suppressContentEditableWarning 
                            className="outline-none"
                            onBlur={(e) => handleCellEdit('info', 2, 1, 'pageNos', e.currentTarget.innerText)}
                          >
                            {form.pageNos}
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <th className="bg-[#f3f4f6] px-2 py-1 border-b border-r border-black font-bold">Topics</th>
                        <td colSpan={5} className={`px-2 py-1 border-b border-black outline-none ${isEditing ? 'bg-yellow-50/30' : ''}`}>
                          <div 
                            contentEditable={isEditing} 
                            suppressContentEditableWarning 
                            className="outline-none"
                            onBlur={(e) => handleCellEdit('info', 3, 0, 'topics', e.currentTarget.innerText)}
                          >
                            {form.topics}
                          </div>
                        </td>
                      </tr>
                      <tr className="border-b border-black">
                        <th className="bg-[#f3f4f6] px-2 py-1 border-r border-black font-bold">Teaching Aids</th>
                        <td colSpan={5} className={`px-2 py-1 outline-none ${isEditing ? 'bg-yellow-50/30' : ''}`}>
                          <div 
                            contentEditable={isEditing} 
                            suppressContentEditableWarning 
                            className="outline-none"
                            onBlur={(e) => handleCellEdit('info', 4, 0, 'teachingAids', e.currentTarget.innerText)}
                          >
                            {form.teachingAids}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* SLO Table Header */}
                <div className="mx-2 mt-2 bg-white text-[10.5pt] relative">
                  <p className="font-bold mb-1">Student Learning Objectives (SLOs) of the week:</p>
                  <table className="w-full border-collapse border border-black text-center relative">
                    <colgroup>
                      {colWidths.map((w, i) => (
                        <col key={i} style={{ width: `${w}%` }} />
                      ))}
                    </colgroup>
                    <thead className="bg-[#f3f4f6]">
                      <tr className="relative">
                        {['SLOs', 'Explanation', 'Assessment', 'Classwork/Homework'].map((h, i) => (
                          <th key={i} className="border border-black p-1.5 font-bold underline leading-tight relative group">
                            {i === 1 ? (
                              <>Explanation<br/><span className="text-[8pt] font-normal no-underline">(Activities & Graphic Organizer)</span></>
                            ) : i === 2 ? (
                              <>Assessment<br/><span className="text-[8pt] font-normal no-underline">(Questions To assess learning)</span></>
                            ) : h}
                            {i < 3 && isEditing && (
                              <div 
                                className={`no-print lp-resizer lp-col-resizer ${resizing?.idx === i ? 'resizing' : ''}`} 
                                onMouseDown={(e) => handleColResize(i, e)} 
                              />
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="text-left align-top">
                      {plan.periods.map((p, pIdx) => (
                        <React.Fragment key={pIdx}>
                          <tr className="group/phead">
                            <td colSpan={4} className="bg-[#f9fafb] border border-black px-3 py-1 font-bold italic relative">
                              <div className="flex items-center justify-between">
                                <span>Period {pIdx + 1}</span>
                                {isEditing && (
                                  <div className="flex gap-2 no-print opacity-0 group-hover/phead:opacity-100 transition-opacity">
                                    <button 
                                      onClick={() => handleAddRowAtIndex(pIdx)}
                                      className="p-1 hover:bg-natural-sage/20 rounded-md text-natural-sage"
                                      title="Add Period Below"
                                    >
                                      <Plus className="w-4 h-4" />
                                    </button>
                                    <button 
                                      onClick={() => handleRemoveRow(pIdx)}
                                      className="p-1 hover:bg-red-50 rounded-md text-red-500"
                                      title="Delete This Period"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                          <tr style={{ height: rowHeights[pIdx + 2] || 'auto' }} className="relative group">
                            {[ 'slo', 'explanation', 'assessment', 'classworkAndHomework' ].map((key, colIdx) => {
                              const borderKey = `slo-${pIdx}-${colIdx}`;
                              const customBorders = cellBorders[borderKey] || {};
                              return (
                                <td 
                                  key={colIdx}
                                  onFocus={() => setActiveCell({ row: pIdx, col: colIdx, section: 'slo' })}
                                  className={`border border-black p-2 leading-relaxed whitespace-pre-line break-words hover:bg-yellow-50/10 transition-colors relative
                                    ${activeCell?.section === 'slo' && activeCell.row === pIdx && activeCell.col === colIdx ? 'lp-cell-active' : ''}
                                    ${isEditing ? 'cursor-text' : ''}
                                  `}
                                  style={{
                                    borderTopWidth: customBorders.top ? '3px' : undefined,
                                    borderBottomWidth: customBorders.bottom ? '3px' : undefined,
                                    borderLeftWidth: customBorders.left ? '3px' : undefined,
                                    borderRightWidth: customBorders.right ? '3px' : undefined,
                                    borderTopColor: customBorders.top ? 'black' : undefined,
                                    borderBottomColor: customBorders.bottom ? 'black' : undefined,
                                    borderLeftColor: customBorders.left ? 'black' : undefined,
                                    borderRightColor: customBorders.right ? 'black' : undefined,
                                    fontSize: '12pt',
                                    fontFamily: 'Arial, sans-serif'
                                  }}
                                >
                                  <div
                                    contentEditable={isEditing}
                                    suppressContentEditableWarning
                                    className="outline-none min-h-[1.5em] w-full rich-text-cell"
                                    onBlur={(e) => handleCellEdit('slo', pIdx, colIdx, key, e.currentTarget.innerHTML)}
                                    dangerouslySetInnerHTML={{ __html: (p as any)[key] }}
                                  />
                                  {isEditing && colIdx === 0 && (
                                    <div className="no-print lp-resizer lp-row-resizer" onMouseDown={(e) => handleRowResize(pIdx + 2, e)} />
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Footer Signatures */}
                <div className="m-3 text-[10pt] space-y-4">
                  <div className="flex items-end gap-2">
                    <p className="font-bold whitespace-nowrap">Remarks (VP):</p>
                    <div className="flex-1 border-b border-black min-h-[1.5em] italic"></div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-x-20 pt-4">
                    <div className="space-y-6">
                      <p className="flex items-end gap-2">Teacher: <span className="flex-1 border-b border-black min-h-[1em]"></span></p>
                      <p className="flex items-end gap-2">VP(sign): <span className="flex-1 border-b border-black min-h-[1em]"></span></p>
                    </div>
                    <div className="space-y-6">
                      <p className="flex items-end gap-2">Section Head: <span className="flex-1 border-b border-black min-h-[1em]"></span></p>
                      <p className="flex items-end gap-2">Principal (sign): <span className="flex-1 border-b border-black min-h-[1em]"></span></p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="no-print mt-12 sm:mt-24 py-8 sm:py-16 border-t border-natural-border dark:border-natural-border-dark text-center transition-colors">
        <p className="text-natural-ink-light dark:text-natural-ink-light-dark text-xs font-semibold tracking-[0.2em] uppercase">
          Crafted for Excellence in Education
        </p>
      </footer>

      {/* Archives Drawer */}
      <AnimatePresence>
        {showArchives && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowArchives(false)}
              className="fixed inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm z-[100] no-print"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-natural-paper dark:bg-natural-paper-dark shadow-2xl z-[101] no-print flex flex-col transition-colors border-l dark:border-natural-border-dark"
            >
              <div className="p-6 sm:p-8 border-b border-natural-border dark:border-natural-border-dark flex items-center justify-between">
                <div>
                  <h2 className="font-serif text-xl sm:text-2xl italic font-bold text-natural-ink dark:text-natural-ink-dark">Archives</h2>
                  <p className="text-natural-ink-light dark:text-natural-ink-light-dark text-[10px] sm:text-xs uppercase tracking-widest mt-1">Your saved lesson plans</p>
                </div>
                <button 
                  onClick={() => setShowArchives(false)}
                  className="p-2 hover:bg-natural-bg dark:hover:bg-natural-bg-dark rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-natural-ink-light dark:text-natural-ink-light-dark" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {archivedPlans.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                    <div className="w-16 h-16 bg-natural-bg dark:bg-natural-bg-dark rounded-2xl flex items-center justify-center text-natural-ink-light dark:text-natural-ink-light-dark">
                      <Archive className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="font-bold text-natural-ink dark:text-natural-ink-dark">No archived plans yet</p>
                      <p className="text-sm text-natural-ink-light dark:text-natural-ink-light-dark mt-1">Saved plans will appear here for quick access.</p>
                    </div>
                  </div>
                ) : (
                  archivedPlans.map((archived) => (
                    <motion.div 
                      key={archived.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => handleLoadArchive(archived)}
                      className="group p-5 bg-white dark:bg-natural-paper-dark rounded-2xl border border-natural-border dark:border-natural-border-dark shadow-sm hover:shadow-md hover:border-natural-sage/30 transition-all cursor-pointer relative"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="space-y-1">
                          <h3 className="font-bold text-natural-ink dark:text-natural-ink-dark">{archived.form.subject}</h3>
                          <p className="text-[10px] text-natural-ink-light dark:text-natural-ink-light-dark uppercase tracking-wider">
                            {archived.form.className} • {archived.form.week}
                          </p>
                        </div>
                        <button 
                          onClick={(e) => handleDeleteArchived(archived.id!, e)}
                          className="p-1.5 text-natural-ink-light dark:text-natural-ink-light-dark hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-2 text-[10px] text-natural-ink-light dark:text-natural-ink-light-dark bg-natural-bg/50 dark:bg-natural-bg-dark/50 px-3 py-1.5 rounded-lg border border-natural-border/30 dark:border-natural-border-dark/30">
                        <Calendar className="w-3 h-3" />
                        <span>Saved {archived.createdAt?.toDate ? archived.createdAt.toDate().toLocaleDateString() : 'recently'}</span>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
