import { Pill } from "lucide-react";

export default function MedicationsList({ medications }) {
  if (!medications || medications.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <Pill className="w-4 h-4 text-primary" />
        Medications
      </h4>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium">Dosage</th>
              <th className="text-left px-3 py-2 font-medium">Frequency</th>
              <th className="text-left px-3 py-2 font-medium hidden sm:table-cell">Notes</th>
            </tr>
          </thead>
          <tbody>
            {medications.map((med, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-2 font-medium">{med.name}</td>
                <td className="px-3 py-2">{med.dosage}</td>
                <td className="px-3 py-2">{med.frequency}</td>
                <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">
                  {med.notes || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
