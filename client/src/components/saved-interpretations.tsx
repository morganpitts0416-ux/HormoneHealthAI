import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Trash2, ExternalLink, Calendar, User } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SavedInterpretation, InterpretationResult, LabValues, FemaleLabValues } from "@shared/schema";
import { format } from "date-fns";

interface SavedInterpretationsProps {
  gender: 'male' | 'female';
  onLoadInterpretation: (labValues: LabValues | FemaleLabValues, interpretation: InterpretationResult) => void;
}

export function SavedInterpretations({ gender, onLoadInterpretation }: SavedInterpretationsProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  const { data: interpretations, isLoading } = useQuery<SavedInterpretation[]>({
    queryKey: ['/api/saved-interpretations', gender, searchTerm],
    queryFn: async () => {
      const url = searchTerm 
        ? `/api/saved-interpretations/search?q=${encodeURIComponent(searchTerm)}&gender=${gender}`
        : `/api/saved-interpretations?gender=${gender}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/saved-interpretations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/saved-interpretations'] });
      toast({
        title: "Deleted",
        description: "Interpretation removed from history.",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete interpretation.",
      });
    },
  });

  const handleLoad = (saved: SavedInterpretation) => {
    onLoadInterpretation(
      saved.labValues as LabValues | FemaleLabValues,
      saved.interpretation as InterpretationResult
    );
    toast({
      title: "Loaded",
      description: `Loaded interpretation for ${saved.patientName}`,
    });
  };

  const getStatusBadge = (interpretation: InterpretationResult) => {
    const redFlagCount = interpretation.redFlags?.length || 0;
    if (redFlagCount > 0) {
      return <Badge variant="destructive" data-testid="badge-red-flags">{redFlagCount} Red Flags</Badge>;
    }
    const abnormalCount = interpretation.interpretations?.filter(i => i.status === 'abnormal' || i.status === 'critical').length || 0;
    if (abnormalCount > 0) {
      return <Badge variant="secondary" data-testid="badge-abnormal">{abnormalCount} Abnormal</Badge>;
    }
    return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-400 dark:border-green-800" data-testid="badge-normal">Normal</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved Interpretations</CardTitle>
        <CardDescription>
          View and load previous lab interpretations for {gender === 'female' ? 'female' : 'male'} patients
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by patient name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            data-testid="input-search-interpretations"
          />
        </div>

        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              Loading saved interpretations...
            </div>
          ) : !interpretations || interpretations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <p>No saved interpretations found</p>
              <p className="text-sm">Save an interpretation to see it here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {interpretations.map((saved) => (
                <Card key={saved.id} className="hover-elevate" data-testid={`card-saved-interpretation-${saved.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium truncate" data-testid={`text-patient-name-${saved.id}`}>
                            {saved.patientName}
                          </span>
                          {getStatusBadge(saved.interpretation as InterpretationResult)}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span data-testid={`text-lab-date-${saved.id}`}>
                            {format(new Date(saved.labDate), 'MMM d, yyyy')} at {format(new Date(saved.createdAt), 'h:mm a')}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleLoad(saved)}
                          data-testid={`button-load-interpretation-${saved.id}`}
                        >
                          <ExternalLink className="w-4 h-4 mr-1" />
                          Load
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(saved.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-interpretation-${saved.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
