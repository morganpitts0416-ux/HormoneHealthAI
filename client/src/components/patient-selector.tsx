import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, UserPlus, User, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { Patient } from "@shared/schema";

interface PatientSelectorProps {
  gender: 'male' | 'female';
  onPatientSelect: (patient: Patient | null) => void;
  selectedPatient: Patient | null;
  initialPatientId?: number;
}

export function PatientSelector({ gender, onPatientSelect, selectedPatient, initialPatientId }: PatientSelectorProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newDob, setNewDob] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: searchResults = [] } = useQuery<Patient[]>({
    queryKey: [`/api/patients/search?q=${encodeURIComponent(searchTerm)}&gender=${gender}`],
    enabled: searchTerm.length >= 2,
  });

  // Auto-select the patient when coming from a patient profile link.
  // NOTE: GET /api/patients/:id returns { patient, labHistory } so we unwrap .patient.
  const { data: initialPatientResponse } = useQuery<{ patient: Patient; labHistory: unknown[] }>({
    queryKey: [`/api/patients/${initialPatientId}`],
    enabled: !!initialPatientId && !selectedPatient,
  });
  const initialPatient = initialPatientResponse?.patient;

  useEffect(() => {
    if (initialPatient && !selectedPatient) {
      onPatientSelect(initialPatient);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPatient]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCreatePatient = async () => {
    if (!newFirstName.trim() || !newLastName.trim()) return;
    try {
      const body: Record<string, unknown> = {
        firstName: newFirstName.trim(),
        lastName: newLastName.trim(),
        gender,
      };
      if (newEmail.trim()) body.email = newEmail.trim().toLowerCase();
      if (newDob) body.dateOfBirth = new Date(newDob).toISOString();
      const res = await apiRequest("POST", "/api/patients", body);
      const patient = await res.json();
      onPatientSelect(patient);
      setShowNewForm(false);
      setNewFirstName("");
      setNewLastName("");
      setNewEmail("");
      setNewDob("");
      setSearchTerm("");
      setShowDropdown(false);
    } catch {
      console.error("Failed to create patient");
    }
  };

  const handleSelectPatient = (patient: Patient) => {
    onPatientSelect(patient);
    setSearchTerm("");
    setShowDropdown(false);
  };

  const handleClearPatient = () => {
    onPatientSelect(null);
    setSearchTerm("");
  };

  if (selectedPatient) {
    return (
      <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800" data-testid="patient-selected-banner">
        <User className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm" data-testid="text-selected-patient-name">
              {selectedPatient.firstName} {selectedPatient.lastName}
            </span>
            <Badge variant="secondary" className="text-xs">
              Patient Profile
            </Badge>
            {selectedPatient.dateOfBirth && (
              <span className="text-xs text-muted-foreground">
                DOB: {new Date(selectedPatient.dateOfBirth).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={handleClearPatient} data-testid="button-clear-patient">
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative" data-testid="patient-selector">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search patient by name..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setShowDropdown(e.target.value.length >= 2);
              setShowNewForm(false);
            }}
            onFocus={() => {
              if (searchTerm.length >= 2) setShowDropdown(true);
            }}
            className="pl-10"
            data-testid="input-patient-search"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setShowNewForm(!showNewForm);
            setShowDropdown(false);
          }}
          data-testid="button-new-patient"
        >
          <UserPlus className="h-4 w-4 mr-1" />
          New
        </Button>
      </div>

      {showDropdown && searchResults.length > 0 && (
        <Card className="absolute z-50 w-full mt-1 shadow-lg">
          <CardContent className="p-1">
            {searchResults.map((patient) => (
              <button
                key={patient.id}
                className="w-full text-left px-3 py-2 rounded-sm hover-elevate flex items-center gap-2"
                onClick={() => handleSelectPatient(patient)}
                data-testid={`patient-result-${patient.id}`}
              >
                <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{patient.firstName} {patient.lastName}</span>
                  {patient.dateOfBirth && (
                    <span className="text-xs text-muted-foreground ml-2">
                      DOB: {new Date(patient.dateOfBirth).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {showDropdown && searchTerm.length >= 2 && searchResults.length === 0 && (
        <Card className="absolute z-50 w-full mt-1 shadow-lg">
          <CardContent className="p-3">
            <p className="text-sm text-muted-foreground text-center">No patients found. Create a new profile?</p>
          </CardContent>
        </Card>
      )}

      {showNewForm && (
        <Card className="mt-2">
          <CardContent className="p-3 space-y-2">
            <p className="text-sm font-medium">Create New Patient</p>
            <div className="flex items-center gap-2">
              <Input
                placeholder="First Name"
                value={newFirstName}
                onChange={(e) => setNewFirstName(e.target.value)}
                data-testid="input-new-patient-first-name"
              />
              <Input
                placeholder="Last Name"
                value={newLastName}
                onChange={(e) => setNewLastName(e.target.value)}
                data-testid="input-new-patient-last-name"
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Input
                  type="email"
                  placeholder="Email (optional — used for appointment matching)"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  data-testid="input-new-patient-email"
                />
              </div>
              <div className="w-40 flex-shrink-0">
                <Input
                  type="date"
                  placeholder="Date of Birth"
                  value={newDob}
                  onChange={(e) => setNewDob(e.target.value)}
                  data-testid="input-new-patient-dob"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Email and date of birth help match this patient to appointments from your scheduling system.
            </p>
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleCreatePatient}
                disabled={!newFirstName.trim() || !newLastName.trim()}
                data-testid="button-create-patient"
              >
                Create Patient
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
