import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
              {hasCritical ? 'PHYSICIAN NOTIFICATION REQUIRED' : 'Clinical Alerts'}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {hasCritical 
                ? 'Critical values detected. Contact physician immediately.' 
                : 'Review the following findings and take appropriate action.'
              }
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {criticalFlags.map((flag, index) => (
          <Alert key={index} variant="destructive" className="border-2" data-testid={`alert-critical-${index}`}>
            <AlertCircle className="h-5 w-5" />
            <AlertTitle className="font-semibold flex items-center gap-2">
              {flag.category}
              <Badge variant="destructive" className="ml-2">CRITICAL</Badge>
            </AlertTitle>
            <AlertDescription className="space-y-2 mt-2">
              <p className="font-medium">{flag.message}</p>
              <p className="text-sm">
                <span className="font-semibold">Action: </span>
                {flag.action}
              </p>
            </AlertDescription>
          </Alert>
        ))}

        {urgentFlags.map((flag, index) => (
          <Alert key={index} className="border-orange-500 bg-orange-50 dark:bg-orange-950/20" data-testid={`alert-urgent-${index}`}>
            <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-500" />
            <AlertTitle className="font-semibold flex items-center gap-2 text-orange-900 dark:text-orange-200">
              {flag.category}
              <Badge className="ml-2 bg-orange-500 text-white">URGENT</Badge>
            </AlertTitle>
            <AlertDescription className="space-y-2 mt-2 text-orange-800 dark:text-orange-300">
              <p className="font-medium">{flag.message}</p>
              <p className="text-sm">
                <span className="font-semibold">Action: </span>
                {flag.action}
              </p>
            </AlertDescription>
          </Alert>
        ))}

        {warningFlags.map((flag, index) => (
          <Alert key={index} className="border-amber-400 bg-amber-50 dark:bg-amber-950/20" data-testid={`alert-warning-${index}`}>
            <Bell className="h-5 w-5 text-amber-600 dark:text-amber-500" />
            <AlertTitle className="font-semibold flex items-center gap-2 text-amber-900 dark:text-amber-200">
              {flag.category}
              <Badge className="ml-2 bg-amber-500 text-white">WARNING</Badge>
            </AlertTitle>
            <AlertDescription className="space-y-2 mt-2 text-amber-800 dark:text-amber-300">
              <p className="font-medium">{flag.message}</p>
              <p className="text-sm">
                <span className="font-semibold">Action: </span>
                {flag.action}
              </p>
            </AlertDescription>
          </Alert>
        ))}
      </CardContent>
    </Card>
  );
}
