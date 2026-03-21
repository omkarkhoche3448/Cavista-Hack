import PatientSessionPage from "@/features/patient-dashboard/PatientSessionPage";

export default function PatientCall() {
  // Patient call “room” uses the same session UI (document sharing + live transcript + summary).
  return <PatientSessionPage />;
}
