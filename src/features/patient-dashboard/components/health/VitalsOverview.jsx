import { Card, CardContent } from "@/components/ui/card";
import { Droplets, Ruler, Phone } from "lucide-react";

export default function VitalsOverview({ vitals }) {
  const bmi = vitals.height_cm && vitals.weight_kg
    ? (vitals.weight_kg / ((vitals.height_cm / 100) ** 2)).toFixed(1)
    : null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Card>
        <CardContent className="flex items-center gap-4 p-5">
          <div className="rounded-lg bg-red-500/10 p-2.5">
            <Droplets className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Blood Type</p>
            <p className="text-xl font-bold">{vitals.blood_type || "—"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center gap-4 p-5">
          <div className="rounded-lg bg-blue-500/10 p-2.5">
            <Ruler className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Height / Weight</p>
            <p className="text-xl font-bold">
              {vitals.height_cm} cm / {vitals.weight_kg} kg
            </p>
            {bmi && (
              <p className="text-xs text-muted-foreground">BMI: {bmi}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center gap-4 p-5">
          <div className="rounded-lg bg-green-500/10 p-2.5">
            <Phone className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Emergency Contact</p>
            <p className="text-sm font-semibold">{vitals.emergency_contact_name}</p>
            <p className="text-xs text-muted-foreground">
              {vitals.emergency_contact_relation} &middot; {vitals.emergency_contact_phone}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
