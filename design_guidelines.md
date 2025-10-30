# Lab Interpretation Tool - Design Guidelines

## Design Approach

**Selected Approach**: Design System-Based (Material Design principles)

**Justification**: Clinical tools prioritize data clarity, efficient workflows, and professional credibility over visual innovation. This utility-focused application demands consistency, learnability, and trust - perfect for a systematic approach.

**Inspiration Sources**: Modern healthcare dashboards (Epic MyChart, Athenahealth) combined with Material Design's robust form and data display patterns.

**Core Principles**:
- Clinical Clarity: Every element serves diagnostic purpose
- Visual Hierarchy: Critical information (red flags) immediately visible
- Efficient Workflows: Minimize clicks, maximize clarity
- Professional Trust: Clean, medical-grade aesthetic

## Typography System

**Font Families**:
- Primary: Inter (via Google Fonts) - exceptional readability for data-dense interfaces
- Monospace: JetBrains Mono - for numerical lab values requiring precise alignment

**Hierarchy**:
- Page Titles: text-3xl font-semibold (Lab Interpretation Dashboard)
- Section Headers: text-xl font-semibold (Patient Information, Lab Results)
- Subsection Headers: text-base font-semibold (Hemoglobin/Hematocrit, Testosterone Levels)
- Body Text: text-sm font-normal (recommendations, guidelines)
- Lab Values: text-base font-mono (numerical results with units)
- Small Labels: text-xs font-medium uppercase tracking-wide (form labels, metadata)
- Red Flag Alerts: text-lg font-bold (critical warnings)

## Layout System

**Spacing Primitives**: Use Tailwind units of 2, 4, 6, and 8 for consistency
- Micro spacing (between related items): p-2, gap-2
- Standard spacing (component padding, gaps): p-4, gap-4, space-y-4
- Section spacing: p-6, py-8
- Major divisions: py-12, mb-8

**Grid Structure**:
- Main container: max-w-7xl mx-auto px-4
- Two-column layout for form + results view: grid grid-cols-1 lg:grid-cols-2 gap-6
- Lab results grid: grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4
- Form inputs: Full-width stacked on mobile, thoughtful grouping on desktop

## Component Library

### Navigation
**Top Navigation Bar**:
- Fixed header with clinic logo/name on left
- Quick actions (New Interpretation, Export PDF) on right
- Breadcrumb below for multi-page navigation
- Height: h-16
- Padding: px-6

### Forms & Data Entry

**Lab Input Form**:
- Organized by panel type (General Health, Hormones, Lipids)
- Accordion sections for each panel (collapsible for focus)
- Two-column input grid within each section
- Input fields: Full border, rounded-md, clear labels above
- Units displayed inline after input (ng/dL, g/dL, etc.)
- Real-time validation indicators (checkmark/warning icons)

**Input Field Specifications**:
- Label: text-xs font-medium uppercase mb-1
- Input: px-4 py-2 rounded-md border-2
- Helper text: text-xs mt-1
- Error states: border color change + icon + error message

### Data Display

**Results Cards**:
- Each lab category gets dedicated card
- Card structure: rounded-lg shadow-md p-6
- Card header: Lab name + timestamp of results
- Status badge in header (Normal/Review/Critical)
- Lab values displayed in table format with:
  - Parameter name (left-aligned)
  - Value in monospace (right-aligned)
  - Reference range (smaller text below value)
  - Visual indicator (icon or subtle background)

**Interpretation Display**:
- Structured sections for each abnormal finding
- Finding title in semibold
- Clinical significance in regular weight
- Recommended action in bulleted list
- Recheck timing prominently displayed

### Alerts & Red Flags

**Critical Alert Banner**:
- Full-width banner at top of results
- Large icon (warning/alert symbol from Heroicons)
- Bold headline: "PHYSICIAN NOTIFICATION REQUIRED"
- Bulleted list of specific red flags triggered
- Minimum height: h-24
- Prominent placement above all other content

**Warning Indicators**:
- Inline warnings within lab cards
- Icon + text combination
- Bordered box with rounded-md
- Padding: p-4

### Action Components

**Primary Actions**:
- Large buttons: px-6 py-3 rounded-lg text-base font-semibold
- Icon + text for clarity
- Generate Report, Export PDF, Send Summary

**Secondary Actions**:
- Medium buttons: px-4 py-2 rounded-md text-sm font-medium
- Clear Previous, Edit Values, View History

**Button Groups**:
- Horizontal layout with gap-4
- Primary action on right (natural reading flow)

### Patient Summary Section

**Summary Generator**:
- Separate collapsible card
- Editable text area for customization
- Template variables auto-populated
- Preview mode showing formatted patient email
- Character count indicator
- Copy to Clipboard button

## Page Layouts

### Main Dashboard
**Structure**:
1. Header (clinic name, quick actions)
2. Two-column layout:
   - Left: Lab input form (sticky on scroll)
   - Right: Live interpretation results
3. Red flag alerts appear at top of right column when triggered
4. Footer with last saved timestamp

### Results View
**Structure**:
1. Patient info bar (name, DOB, test date)
2. Red flag banner (if applicable)
3. Grid of lab result cards (3 columns on desktop)
4. Interpretation section below results
5. Recommendations panel with action items
6. Patient summary generator at bottom
7. Export/Print controls in sticky footer

## Accessibility

- All form inputs have visible labels
- Color not sole indicator of status (use icons + text)
- Sufficient contrast ratios for medical readability
- Keyboard navigation for all interactive elements
- Screen reader-friendly table structures for lab values
- Focus indicators on all interactive elements

## Icons

Use Heroicons (outline style) via CDN:
- Alert/Warning: ExclamationTriangleIcon
- Success/Normal: CheckCircleIcon
- Info: InformationCircleIcon
- Download: ArrowDownTrayIcon
- Print: PrinterIcon
- Edit: PencilSquareIcon
- Plus: PlusIcon

## Responsive Behavior

**Mobile (< 768px)**:
- Single column layout
- Accordion-based lab input (one panel at a time)
- Sticky submit button at bottom
- Results stack vertically
- Simplified card layouts

**Tablet (768px - 1024px)**:
- Two-column lab results grid
- Form remains single column
- Side-by-side view optional (toggle)

**Desktop (> 1024px)**:
- Full two-column layout (form + results)
- Three-column lab results grid
- All features visible simultaneously