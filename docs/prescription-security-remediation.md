# Urgent separate security remediation

Owner: clinic security/database owner. Status: outstanding; required before live signing.

A password-bearing database connection string was found in historical uploaded
files already reachable from GitHub. Do not copy, print, test, reuse, include in
release artifacts, or distribute the credential. No credential values belong in
this document or a support/chat message.

Required separately authorized actions:

1. Rotate/revoke the affected database credential using the database provider's
   secure controls. Coordinate application Secret Manager/secret bindings with
   the approved deployment process; do not change production from this task.
2. Review database access and available access logs, GitHub repository access,
   and distribution to clones, forks, CI, and other systems.
3. Have the privacy owner review clinical uploads and determine whether PHI or
   confidential clinic records were exposed and what incident response applies.
4. Prepare approved repository-history/cache/clone remediation separately. A
   private repository and deleting a file at HEAD do not remove historical risk.

This does not block local prescription implementation, synthetic verification,
or creation of a code-only release patch. It does block live activation until
the security owner records completed containment/access review. No history
rewrite or credential rotation was performed by this implementation task.

Dependency remediation for this release:

- jsPDF upgraded from 3.0.3 to 4.2.1; compatible AutoTable upgraded to 5.0.8.
- Express upgraded within version 4 to 4.22.2.
- proxy-addr explicitly pinned to the patched 2.0.8 dependency line.
- Existing clinical PDF APIs and proxy hop configuration are retained. Synthetic
  PDF, authorization, storage failure and regression tests are required before
  approving the reconciled production artifact.

The post-change dependency audit reports **zero critical** findings. It still
reports 30 high, 32 moderate and 8 low findings across the wider application.
This is not a clean security certification; assess the remaining findings
separately before approving production exposure. Do not claim they were fixed
or that generic controls constitute an approved exception.

The existing general HTTP logger still serializes some non-prescription JSON
responses. The release deidentifies prescription paths and response content;
other clinical API logging needs separately authorized privacy remediation.
No actual patient responses were requested or inspected during this work.
