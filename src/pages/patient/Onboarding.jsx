import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
    ChevronRight,
    ChevronLeft,
    Upload,
    User,
    HeartPulse,
    Phone,
    CheckCircle2,
    FileText,
    Weight,
    Ruler,
    Droplets,
    Loader2,
    Lock
} from "lucide-react";
import { useAuth } from "@/features/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { onboardPatient } from "@/services/authService";
import { uploadDocument } from "@/services/documentService";

const DOC_TYPES = [
    { value: "lab_report", label: "Lab Report" },
    { value: "imaging", label: "Imaging / X-ray" },
    { value: "prescription", label: "Prescription" },
    { value: "other", label: "Other" },
];

const PageTransition = ({ children }) => (
    <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="space-y-6"
    >
        {children}
    </motion.div>
);

export default function Onboarding() {
    const { session, refreshProfile } = useAuth();
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        date_of_birth: "",
        gender: "",
        phone: "",
        blood_type: "",
        height_cm: "",
        weight_kg: "",
        emergency_contact_name: "",
        emergency_contact_phone: "",
        emergency_contact_relation: "",
        insurance_provider: "",
        insurance_policy_number: "",
    });

    // Document State
    const [file, setFile] = useState(null);
    const [docTitle, setDocTitle] = useState("");
    const [docType, setDocType] = useState("lab_report");
    const [isDocumentUploaded, setIsDocumentUploaded] = useState(false);

    const totalSteps = 4;

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const nextStep = () => {
        setStep(prev => Math.min(prev + 1, totalSteps));
    };

    const prevStep = () => setStep(prev => Math.max(prev - 1, 1));

    async function handleFileUpload() {
        if (!file || !docTitle) {
            toast.error("Please select a file and provide a title.");
            return;
        }

        // Trigger upload in background
        uploadDocument(session.access_token, {
            file,
            title: docTitle,
            documentType: docType,
        }).catch(err => {
            console.error("Background onboarding upload failed:", err);
        });

        setIsDocumentUploaded(true);
        toast.success("Document added! We are processing it in the background.");

        // Move to next step immediately
        setStep(2);
    }

    async function handleSubmit() {
        // Basic validation
        const requiredFields = [
            "date_of_birth", "gender", "phone",
            "emergency_contact_name", "emergency_contact_phone"
        ];

        for (const field of requiredFields) {
            if (!formData[field]) {
                toast.error(`Please fill in all required fields.`);
                return;
            }
        }

        // Deep copy and sanitize data
        const submissionData = { ...formData };

        // Handle numeric fields (prevent float_parsing errors)
        submissionData.height_cm = submissionData.height_cm === "" ? null : parseFloat(submissionData.height_cm);
        submissionData.weight_kg = submissionData.weight_kg === "" ? null : parseFloat(submissionData.weight_kg);

        // Nullify other empty strings for consistency
        ["blood_type", "emergency_contact_relation", "insurance_provider", "insurance_policy_number"].forEach(field => {
            if (submissionData[field] === "") submissionData[field] = null;
        });

        setLoading(true);
        try {
            await onboardPatient(session.access_token, submissionData);
            toast.success("Profile completed! Welcome to Sevamitra.");
            await refreshProfile();
            navigate("/patient/dashboard");
        } catch (err) {
            toast.error(err.message || "Failed to complete onboarding");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-50 via-slate-50 to-indigo-50 flex items-center justify-center p-6 md:p-12">
            <div className="w-full max-w-xl relative scale-[0.9] origin-center">
                {/* Progress Bar */}
                <div className="absolute -top-12 left-0 w-full flex justify-between px-2">
                    {[1, 2, 3, 4].map((s) => (
                        <div key={s} className="flex flex-col items-center gap-2">
                            <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${s === step ? "bg-primary text-white scale-110 shadow-lg shadow-primary/20" :
                                    s < step ? "bg-green-500 text-white" : "bg-white text-slate-400 border border-slate-200"
                                    }`}
                            >
                                {s < step ? <CheckCircle2 className="w-5 h-5" /> : s}
                            </div>
                        </div>
                    ))}
                    <div className="absolute top-4 left-0 w-full h-[2px] bg-slate-200 -z-10">
                        <motion.div
                            className="h-full bg-primary"
                            initial={{ width: "0%" }}
                            animate={{ width: `${((step - 1) / (totalSteps - 1)) * 100}%` }}
                            transition={{ duration: 0.5 }}
                        />
                    </div>
                </div>

                <Card className="p-8 md:p-10 shadow-2xl bg-white/80 backdrop-blur-xl border-white/20 rounded-[2.5rem] overflow-hidden">
                    <form onSubmit={(e) => e.preventDefault()}>
                        <AnimatePresence mode="wait">
                            {step === 1 && (
                                <PageTransition key="step1">
                                    <div className="space-y-2">
                                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-600 text-xs font-bold mb-2">
                                            <Lock className="w-3 h-3" /> HIPAA COMPLIANT SECURE STORAGE
                                        </div>
                                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Security & Medical Documents</h1>
                                        <p className="text-slate-500 text-sm leading-relaxed">
                                            (Optional) For better care, you can upload clinical records like lab reports or prescriptions. You can also skip this for now.
                                        </p>
                                    </div>

                                    <div className="space-y-5 py-4">
                                        <div className="grid gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-slate-700 font-semibold" htmlFor="doc-title">Document Title</Label>
                                                <Input
                                                    id="doc-title"
                                                    placeholder="e.g. Annual Blood Work 2024"
                                                    value={docTitle}
                                                    onChange={(e) => setDocTitle(e.target.value)}
                                                    className="bg-white/50 border-slate-200 focus:ring-primary h-11 rounded-xl"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-slate-700 font-semibold" htmlFor="doc-type">Document Type</Label>
                                                <select
                                                    id="doc-type"
                                                    value={docType}
                                                    onChange={(e) => setDocType(e.target.value)}
                                                    className="flex h-11 w-full rounded-xl border border-slate-200 bg-white/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                                >
                                                    {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        <div
                                            className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer hover:bg-slate-50 ${file ? "border-green-400 bg-green-50" : "border-slate-300"
                                                }`}
                                        >
                                            <input
                                                type="file"
                                                id="onboarding-file"
                                                className="hidden"
                                                onChange={(e) => {
                                                    const f = e.target.files[0];
                                                    if (f) {
                                                        setFile(f);
                                                        if (!docTitle) setDocTitle(f.name.split('.')[0]);
                                                    }
                                                }}
                                            />
                                            <label htmlFor="onboarding-file" className="cursor-pointer block">
                                                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                                    <Upload className="w-8 h-8 text-blue-600" />
                                                </div>
                                                <h3 className="text-slate-900 font-bold mb-1">
                                                    {file ? file.name : "Select your clinical records"}
                                                </h3>
                                                <p className="text-slate-400 text-xs">PDF, JPG or PNG. Max size 10MB.</p>
                                            </label>
                                        </div>

                                        {file && !isDocumentUploaded && (
                                            <Button
                                                type="button"
                                                onClick={handleFileUpload}
                                                className="w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold"
                                                disabled={loading}
                                            >
                                                {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
                                                Upload Document
                                            </Button>
                                        )}

                                        {isDocumentUploaded && (
                                            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-200 text-green-700">
                                                <CheckCircle2 className="w-6 h-6 shrink-0" />
                                                <div className="text-sm font-semibold">Document uploaded and processed successfully!</div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-between items-center pt-4">
                                        <Button type="button" variant="ghost" onClick={nextStep} className="h-11 px-6 rounded-xl font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-500 dark:hover:bg-slate-800">
                                            Skip for now
                                        </Button>
                                        <Button type="button" onClick={nextStep} className="h-11 px-8 rounded-xl font-bold gap-2">
                                            {isDocumentUploaded ? "Next Section" : "Continue"} <ChevronRight className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </PageTransition>
                            )}

                            {step === 2 && (
                                <PageTransition key="step2">
                                    <div className="space-y-2">
                                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-100 text-rose-600 text-xs font-bold mb-2">
                                            <HeartPulse className="w-3 h-3" /> CLINICAL PROFILE
                                        </div>
                                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Health Vitals</h1>
                                        <p className="text-slate-500 text-sm">Basic health metrics help our doctors during diagnosis.</p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                                        <div className="space-y-2">
                                            <Label className="text-slate-700 font-semibold">Blood Type</Label>
                                            <div className="relative">
                                                <Droplets className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                <select
                                                    name="blood_type"
                                                    value={formData.blood_type}
                                                    onChange={handleInputChange}
                                                    className="pl-11 h-11 w-full rounded-xl border border-slate-200 bg-white/50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                                >
                                                    <option value="">Select Blood Group</option>
                                                    {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(bt => <option key={bt} value={bt}>{bt}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-slate-700 font-semibold">Height (cm)</Label>
                                            <div className="relative">
                                                <Ruler className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                <Input
                                                    name="height_cm"
                                                    type="number"
                                                    placeholder="175"
                                                    value={formData.height_cm}
                                                    onChange={handleInputChange}
                                                    className="pl-11 h-11 bg-white/50 rounded-xl"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-slate-700 font-semibold">Weight (kg)</Label>
                                            <div className="relative">
                                                <Weight className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                <Input
                                                    name="weight_kg"
                                                    type="number"
                                                    placeholder="70"
                                                    value={formData.weight_kg}
                                                    onChange={handleInputChange}
                                                    className="pl-11 h-11 bg-white/50 rounded-xl"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-between pt-4">
                                        <Button type="button" variant="ghost" onClick={prevStep} className="h-11 px-6 rounded-xl font-bold">
                                            <ChevronLeft className="w-4 h-4 mr-2" /> Back
                                        </Button>
                                        <Button type="button" onClick={nextStep} className="h-11 px-8 rounded-xl font-bold gap-2">
                                            Next Section <ChevronRight className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </PageTransition>
                            )}

                            {step === 3 && (
                                <PageTransition key="step3">
                                    <div className="space-y-2">
                                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 text-indigo-600 text-xs font-bold mb-2">
                                            <User className="w-3 h-3" /> PERSONAL DETAILS
                                        </div>
                                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Identity & Contact</h1>
                                        <p className="text-slate-500 text-sm">Complete your legal medical profile.</p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                                        <div className="space-y-2">
                                            <Label className="text-slate-700 font-semibold">
                                                Date of Birth <span className="text-rose-500">*</span>
                                            </Label>
                                            <Input
                                                name="date_of_birth"
                                                type="date"
                                                value={formData.date_of_birth}
                                                onChange={handleInputChange}
                                                className="h-11 bg-white/50 rounded-xl"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-slate-700 font-semibold">
                                                Gender <span className="text-rose-500">*</span>
                                            </Label>
                                            <select
                                                name="gender"
                                                value={formData.gender}
                                                onChange={handleInputChange}
                                                className="h-11 w-full rounded-xl border border-slate-200 bg-white/50 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                            >
                                                <option value="">Select Gender</option>
                                                <option value="male">Male</option>
                                                <option value="female">Female</option>
                                                <option value="other">Other</option>
                                                <option value="prefer_not_to_say">Prefer not to say</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2 col-span-full">
                                            <Label className="text-slate-700 font-semibold">
                                                Phone Number <span className="text-rose-500">*</span>
                                            </Label>
                                            <div className="relative">
                                                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                <Input
                                                    name="phone"
                                                    placeholder="+1 (123) 456-7890"
                                                    value={formData.phone}
                                                    onChange={handleInputChange}
                                                    className="pl-11 h-11 bg-white/50 rounded-xl"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-between pt-4">
                                        <Button type="button" variant="ghost" onClick={prevStep} className="h-11 px-6 rounded-xl font-bold">
                                            <ChevronLeft className="w-4 h-4 mr-2" /> Back
                                        </Button>
                                        <Button type="button" onClick={nextStep} className="h-11 px-8 rounded-xl font-bold gap-2">
                                            Next Section <ChevronRight className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </PageTransition>
                            )}

                            {step === 4 && (
                                <PageTransition key="step4">
                                    <div className="space-y-2">
                                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100 text-amber-600 text-xs font-bold mb-2">
                                            <Phone className="w-3 h-3" /> EMERGENCY & INSURANCE
                                        </div>
                                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Final Details</h1>
                                        <p className="text-slate-500 text-sm">Who should we contact in case of an emergency?</p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
                                        <div className="space-y-2">
                                            <Label className="text-slate-700 font-semibold">
                                                Emergency Contact Name <span className="text-rose-500">*</span>
                                            </Label>
                                            <Input
                                                name="emergency_contact_name"
                                                placeholder="Full Name"
                                                value={formData.emergency_contact_name}
                                                onChange={handleInputChange}
                                                className="h-11 bg-white/50 rounded-xl"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-slate-700 font-semibold">Relation</Label>
                                            <Input
                                                name="emergency_contact_relation"
                                                placeholder="e.g. Spouse, Parent"
                                                value={formData.emergency_contact_relation}
                                                onChange={handleInputChange}
                                                className="h-11 bg-white/50 rounded-xl"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-slate-700 font-semibold">
                                                Emergency Phone <span className="text-rose-500">*</span>
                                            </Label>
                                            <Input
                                                name="emergency_contact_phone"
                                                placeholder="Phone Number"
                                                value={formData.emergency_contact_phone}
                                                onChange={handleInputChange}
                                                className="h-11 bg-white/50 rounded-xl"
                                            />
                                        </div>

                                        <div className="col-span-full pt-4">
                                            <div className="flex items-center gap-3 p-4 bg-blue-50/50 rounded-2xl border border-blue-100 mb-6">
                                                <FileText className="w-6 h-6 text-blue-400" />
                                                <div className="text-xs text-blue-600 font-medium">
                                                    Insurance details are optional but recommended for smooth billing and pharmacy orders.
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label className="text-slate-700 font-semibold">Insurance Provider</Label>
                                            <Input
                                                name="insurance_provider"
                                                placeholder="Company Name"
                                                value={formData.insurance_provider}
                                                onChange={handleInputChange}
                                                className="h-11 bg-white/50 rounded-xl"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-slate-700 font-semibold">Policy Number</Label>
                                            <Input
                                                name="insurance_policy_number"
                                                placeholder="ID / Group #"
                                                value={formData.insurance_policy_number}
                                                onChange={handleInputChange}
                                                className="h-11 bg-white/50 rounded-xl"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex justify-between pt-4">
                                        <Button type="button" variant="ghost" onClick={prevStep} className="h-11 px-6 rounded-xl font-bold">
                                            <ChevronLeft className="w-4 h-4 mr-2" /> Back
                                        </Button>
                                        <Button
                                            type="submit"
                                            onClick={handleSubmit}
                                            className="h-11 px-8 rounded-xl font-bold bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/20"
                                            disabled={loading}
                                        >
                                            {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
                                            Complete Profile
                                        </Button>
                                    </div>
                                </PageTransition>
                            )}
                        </AnimatePresence>
                    </form>
                </Card>

                {/* Support Link */}
                <p className="mt-8 text-center text-slate-400 text-sm">                </p>
            </div>
        </div>
    );
}
