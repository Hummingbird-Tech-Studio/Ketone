# Product Specification: Advanced Plan Templates

## 1. Feature Vision
To provide users with a personalized fasting library that eliminates the overhead of repetitive configuration. By allowing users to save their customized protocols from System Presets, we transform one-time configurations into reusable assets.

## 2. Core Business Rules

### 2.1 Template Constraints
*   **Storage Cap:** Hard limit of **20 templates** per user.
*   **Source Authority:** Templates **cannot** be created from scratch. They must originate from an existing System Preset or an Active Plan being edited.
*   **Data Integrity:** The system saves **Target Durations** (planned hours) rather than **Actual Durations** (logged hours) to ensure clean, reusable templates.

### 2.2 Intelligent Naming Logic
To maintain a clean library and prevent identity confusion:
1.  **Custom Name Priority:** If the user manually renames the plan during the "Plan Settings" phase, that string is used as the template name.
2.  **Default Suffix:** If the user keeps the System Preset name (e.g., "16-8"), the system automatically appends the suffix: `[Preset Name] (copy)`.
3.  **Collision Handling:** If a name already exists (e.g., "16-8 (copy)" is already in the library), the system applies an **auto-incrementing suffix**:
    *   *First duplicate:* `16-8 (copy) (1)`
    *   *Second duplicate:* `16-8 (copy) (2)`

## 3. User Flows

### 3.1 The "Just-in-Time" Save (Primary Flow)
1.  **Discovery:** User selects a System Preset (e.g., "OMAD").
2.  **Customization:** User modifies periods or settings.
3.  **Execution:** User clicks **"Start Plan"**.
4.  **Confirmation Modal:** A modal appears asking: *"Would you like to save this configuration as a template for future use?"*
5.  **Outcome:**
    *   **The Plan starts immediately** (regardless of the user's choice) and the user is redirected to the Fasting Tracker.
    *   **If "Yes"**: The template is simultaneously created in the background using the Naming Logic.
    *   **If "No"**: No template is saved.

### 3.2 The "Ongoing Adjustment" Save
1.  **Action:** User edits an **active/ongoing** plan.
2.  **Trigger:** Upon saving changes to the active plan, the user is given the option to save this new configuration as a **new** template.
3.  **Rule:** This always creates a **new** entry using the `(copy)` naming logic; it never overwrites the original template if one was used.

### 3.3 Library Management (My Templates)
*   **Apply:** Creates a new Active Plan starting **"Now"**.
*   **Duplicate:** Creates a 1:1 copy following the increment logic (e.g., "My Plan (copy)").
*   **Edit:** Allows the user to modify the name, description, and period structure of the template.
*   **Delete:** Permanently removes the entry to free up the 20-item quota.

## 4. Conflict & Timing Logic

### 4.1 "Now" vs. "Delayed" Start
*   When a user starts a plan, the record officially starts at the current timestamp (**Now**).
*   If the user's first period is scheduled for the future (e.g., in 2 hours), the **Fasting Tracker** will display a countdown until the fast begins, while the Plan remains active in the background.

### 4.2 Concurrent Plan Conflict
*   The system enforces a **"Single Active Plan"** rule.
*   If a user attempts to "Start Plan" while another plan is **Ongoing**, the system blocks the action and displays a Conflict Modal: *"You already have a plan in progress. Please complete or cancel your current plan before starting a new one."*
