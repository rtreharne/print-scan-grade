# PrintScanGrade user guide

PrintScanGrade helps you turn paper multiple-choice answer sheets into checked grades, cohort analysis and downloadable results. It has three workspace types:

| Workspace | Use it when |
| --- | --- |
| Standalone | You want to create and run an assessment workspace without an LTI connection. |
| Course/LTI | Your learning platform launches PrintScanGrade for a course and supplies its roster. |
| UoL legacy | You already use the University of Liverpool five-choice MCQ sheets. |

This guide is for instructors and assessment administrators. Scan processing and grades are stored in the browser that performed the work, so keep the same browser, browser profile and workspace URL until you have exported what you need.

## Before you start

### What you need

For a generated answer sheet, prepare:

- A completed master answer sheet, with student number `000000000`.
- Completed student sheets.
- Scans as one or more PDFs, or a ZIP containing PDFs.
- A roster CSV if you use a standalone workspace and want student matching.

Generated sheets support 1–60 questions and 2–8 answer choices. PDFs may be up to 64 MB each, and a ZIP may be up to 256 MB. The UoL legacy reader supports its existing A–E sheet format, with up to 120 questions.

### Protect your results

The normal scan workflow reads files in the browser. Results, preview images, imported standalone rosters and manual matches are retained in that browser's storage, rather than being saved with the design on the server. Therefore:

- Do not clear this site's browser data before exporting.
- Do not expect results to appear on another computer, browser or browser profile.
- Export the XLSX workbook and any annotated PDFs you require before deleting scans or browser data.
- Keep the original papers and scan files until review is complete.

## Generated-sheet workflow

### 1. Create and print an answer-sheet design

1. Open the standalone start page, or open Print from an LTI course launch.
2. Give the assessment a clear title, then choose the question count and the number of answer choices. You may add a PNG or JPEG logo.
3. In standalone mode, you can enter an earlier printed `FORM` code if you need a new workspace to recognise sheets from that form.
4. Create the workspace. Standalone users provide a responsible contact, institution and department, and accept the usage policy.
5. Download the A4 PDF. It contains the answer sheet and a student guide. In standalone mode, save the private workspace URL; optionally copy the iframe code to embed it in a VLE.

For each assessment, complete one master sheet with the correct answers and bubble student number `000000000`. Keep it with the student scans; it becomes the answer key during grading.

### 2. Prepare scans

Scan completed answer sheets to PDF. A multi-page PDF is fine, as is a ZIP of PDFs. Include the master answer sheet. The scanner skips generated student-guide pages.

For reliable reading, use clean, upright scans with all page edges visible. Review faint marks, erased marks, crossed corrections and incomplete ID bubbles especially carefully after scanning.

### 3. Import a roster when needed

In a standalone workspace, import the class roster CSV before scanning if you want names and IDs matched. Map the source columns for student name and student number in the importer. A usable ID is nine digits; the importer can find a nine-digit ID inside a longer source value, such as a SIS login ID.

In an LTI workspace, the course roster is supplied by the learning platform. If it is missing or incomplete, ask the platform administrator to check LTI roster permissions and enrolments.

### 4. Scan the files

1. Open **Scan**.
2. Choose a PDF or ZIP of PDFs.
3. Select **Scan file** and wait for processing to complete.
4. If you want to try the process safely first, use the standalone dummy ZIP option. It contains a master and example student pages, including some cases intended for review.

The scan creates a scan set. You can create multiple scan sets for different uploaded batches or answer-sheet designs.

### 5. Select the answer key and marking rules

1. Open **Grade** and select the relevant answer sheet and scan set.
2. Choose the completed master sheet as the answer key. The master is excluded from student grades.
3. Check the detected key answers before relying on scores.
4. Where a key has multiple correct answers, choose the marking rule for that question.

Each question is worth one mark. With multiple keyed answers, the selected rule controls how the keyed answers are assessed; extra uncrossed selections outside the key are incorrect. Blank and unresolved responses earn no mark.

### 6. Review student responses and matches

The **Students** tab lists roster students and scanned pages. Sort it by student, score or percentage, then select a student/page to inspect the annotated scan and extracted answers.

Use **Resolve unidentified students** for pages that could not be matched. Inspect the cropped handwritten name and number, search the roster, choose the correct student, and select **Assign and next**. You can skip a page and return to it later.

Standalone matching may infer a match where eight of nine ID bubbles agree with a unique roster ID. These inferred matches are labelled and can be changed. Ambiguous IDs remain unidentified. Review the annotation before treating any unusual result as final.

You can save corrections to extracted answers from the review screen where that control is available. Re-scanning the original PDF replaces that scan set, including manual answer edits and score settings.

### 7. Analyse the cohort

Select **Analysis** to view:

- Score distribution and descriptive statistics.
- Undergraduate or postgraduate grade-class proportions.
- Percentage correct by question.
- Kelley upper/lower 27% discrimination.
- Answer-option distributions, with keyed options identified.

The analysis uses the selected answer key and the scanned pages. Roster students without scans are not included. Item-level statistics exclude unresolved responses, although those responses remain unearned in total scores. Use **Export analysis PDF** to open the landscape print view, then choose **Save as PDF** in the browser print dialog.

### 8. Export results

Use **Export XLSX** in the grade view. The workbook contains:

| Sheet | Contents |
| --- | --- |
| **Grades** | Student ID, student name, total score and percentage. Values link to Raw matrix. |
| **Raw matrix** | Student details, one mark column per question, total and percentage. This is the source data for workbook-level statistics. |
| **Question analysis** | Item analysis produced at export time. |
| **Grade statistics** | Student count, mean, median, sample SD, minimum, maximum, question count and grade-band counts. |

The descriptive statistics and grade-band counts on **Grade statistics** are formulas linked to **Raw matrix**. To model a change in Excel, edit or delete the relevant student's row in **Raw matrix**; the **Grades** and **Grade statistics** sheets recalculate. If calculation is set to manual in your spreadsheet application, recalculate the workbook first.

The regular workspace can also export annotated student PDFs as a ZIP where annotated scans are available. Each PDF includes the annotated page and an answer/score summary.

## UoL legacy workflow

Use the UoL legacy workspace only for the existing University of Liverpool MCQ sheets. It reads the original five-choice layout; it does not generate a replacement form.

1. Open the UoL legacy workspace and complete the responsible-use step if prompted.
2. In **Print**, save the private link or copy the iframe code if you need to share/embed the workspace.
3. In **Scan**, import and map a roster CSV. A roster is required before scanning.
4. Upload a multi-page PDF or ZIP containing PDFs, including the completed master sheet, then select **Scan pages**.
5. In **Grade**, select the master page. It supplies the key and is excluded from student results.
6. Review matches and annotated scans. Use **Resolve unidentified students** or **Change student match** to correct assignments.
7. Review **Analysis** and use **Export XLSX** for results. Its workbook has the same Grades, Raw matrix, Question analysis and Grade statistics sheets described above.

The reader supports colour and grayscale scans. It attempts to read the existing nine-column ID bubble grid and uses the strongest detected response for each question. Duplicate student scans are treated as separate observations in UoL legacy analysis.

## Common problems

### A student is not identified

Check the ID bubbles and handwritten information in the review screen. Use the matching dialog to assign a roster student. Do not assume a handwritten ID alone was read; matching is strongest when the bubbles are clear.

### The score does not look right

Confirm the selected answer key and its marking rules, then inspect the annotated student page. Look for faint marks, crossings, multiple selections, blanks and unresolved responses. Correct the response when appropriate, then save the change.

### The scan looks faded or warns that it is stale

Re-scan the original PDF. A stale preview may have been based on an old browser rendering and can be less accurate. Re-scanning replaces that set's manual answer edits and score settings, so export or record essential work first.

### My spreadsheet statistics did not update

Edit/delete the student in **Raw matrix**, not just **Grades**, then recalculate the workbook. Grade statistics are formulas over the percentage column in Raw matrix. The Question analysis sheet is a snapshot created when the workbook was exported; export a new workbook after changes if you need refreshed item-level analysis.

### I cannot find earlier results

Return using the same workspace URL, browser and browser profile. Results do not transfer automatically between browsers or devices. If browser storage has been cleared, re-scan the original files.

## For LTI administrators

PrintScanGrade supports LTI 1.3 course launches, Deep Linking and roster access through the Names and Role Provisioning Service. Register the tool using the public HTTPS origin and grant the requested roster-read scope. The administrator and setup details are in the project [README](README.md#lti-setup).

Automatic gradebook passback is not implemented. Export the workbook and use your institution's approved grade-import process.
