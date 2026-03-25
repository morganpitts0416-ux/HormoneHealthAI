import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, AlertCircle, Bell } from "lucide-react";
import type { RedFlag } from "@shared/schema";

interface RedFlagAlertProps {
  redFlags: RedFlag[];
}

export function RedFlagAlert({ redFlags }: RedFlagAlertProps) {
  if (redFlags.length === 0) return null;

  const criticalFlags = redFlags.filter(f => f.severity === 'critical');
  const urgentFlags = redFlags.filter(f => f.severity === 'urgent');
  const warningFlags = redFlags.filter(f => f.severity === 'warning');

  const hasCritical = criticalFlags.length > 0;

  return (
    <Card className={`border-2 ${hasCritical ? 'border-destructive bg-destructive/5' : 'border-orange-500 bg-orange-50 dark:bg-orange-950/20'}`} data-testid="card-red-flags">
      <CardHeader className="pb-4">
        <div className="flex items-start gap-4">
          <div className={`mt-1 ${hasCritical ? 'text-destructive' : 'text-orange-600 dark:text-orange-500'}`}>
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="flex-1">
            <CardTitle className={`text-xl ${hasCritical ? 'text-destructive' : 'text-orange-900 dark:text-orange-200'}`}>
              {hasCritical ? 'Critical: Immediate Action Required' : 'Clinical Alerts'}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {hasCritical
                ? 'Critical laboratory values identified — intervention required per protocol.'
                : 'The following findings require clinical review and action.'}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {criticalFlags.map((flag, index) => (
          <div
            key={index}
            className="rounded-md border-2 border-destructive bg-destructive/5 p-4 space-y-2"
            data-testid={`alert-critical-${index}`}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
              <p className="font-semibold text-destructive">{flag.category}</p>
              <Badge variant="destructive" className="ml-auto">CRITICAL</Badge>
            </div>
            <p className="text-sm font-medium pl-7">{flag.message}</p>
            <div className="pl-7 pt-1 border-t border-destructive/20">
              <p className="text-xs font-semibold uppercase tracking-wide text-destructive/80 mb-0.5">Clinical Action</p>
              <p className="text-sm">{flag.action}</p>
            </div>
          </div>
        ))}

        {urgentFlags.map((flag, index) => (
          <div
            key={index}
            className="rounded-md border border-orange-400 bg-orange-50 dark:bg-orange-950/20 p-4 space-y-2"
            data-testid={`alert-urgent-${index}`}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-500 shrink-0" />
              <p className="font-semibold text-orange-900 dark:text-orange-200">{flag.category}</p>
              <Badge className="ml-auto bg-orange-500 text-white">URGENT</Badge>
            </div>
            <p className="text-sm font-medium pl-7 text-orange-800 dark:text-orange-300">{flag.message}</p>
            <div className="pl-7 pt-1 border-t border-orange-300/50 dark:border-orange-700/50">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-400 mb-0.5">Clinical Action</p>
              <p className="text-sm text-orange-800 dark:text-orange-300">{flag.action}</p>
            </div>
          </div>
        ))}

        {warningFlags.map((flag, index) => (
          <div
            key={index}
            className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2"
            data-testid={`alert-warning-${index}`}
          >
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-amber-600 dark:text-amber-500 shrink-0" />
              <p className="font-semibold text-amber-900 dark:text-amber-200">{flag.category}</p>
              <Badge className="ml-auto bg-amber-500 text-white">REVIEW</Badge>
            </div>
            <p className="text-sm font-medium pl-7 text-amber-800 dark:text-amber-300">{flag.message}</p>
            <div className="pl-7 pt-1 border-t border-amber-300/50 dark:border-amber-700/50">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-0.5">Clinical Action</p>
              <p className="text-sm text-amber-800 dark:text-amber-300">{flag.action}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
