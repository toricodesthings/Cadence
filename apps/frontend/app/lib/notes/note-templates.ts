/**
 * Note templates — calm, task-oriented starting points.
 * Accessed via /template slash command or template insert action.
 */

export interface NoteTemplate {
  id: string;
  label: string;
  description: string;
  body: string;
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: "checklist",
    label: "Checklist",
    description: "Simple checklist to track steps",
    body: `## Checklist

- [ ] Step 1
- [ ] Step 2
- [ ] Step 3
`,
  },
  {
    id: "bullets",
    label: "Bullet List",
    description: "Quick bullet outline",
    body: `## Notes

- Point one
- Point two
- Point three
`,
  },
  {
    id: "meeting",
    label: "Meeting Notes",
    description: "Capture meeting outcomes and actions",
    body: `## Meeting Notes

**Date:** ${new Date().toLocaleDateString()}
**Attendees:**

---

### Discussion

-

### Decisions

-

### Next Steps

- [ ]
`,
  },
  {
    id: "brainstorm",
    label: "Brainstorm",
    description: "Free-form idea capture",
    body: `## Brainstorm

### Ideas

-

### Themes

-

### Next Steps

- [ ]
`,
  },
  {
    id: "decision",
    label: "Decision Record",
    description: "Document a key decision and context",
    body: `## Decision

**Context:**

**Options considered:**
1.
2.
3.

**Decision:**

**Reasoning:**

### Action Items

- [ ]
`,
  },
  {
    id: "next-steps",
    label: "Next Steps",
    description: "Plan clear follow-up actions",
    body: `## Next Steps

- [ ] Action 1
- [ ] Action 2
- [ ] Action 3

### Notes

`,
  },
];

/**
 * Returns a template by its ID.
 */
export function getTemplate(id: string): NoteTemplate | undefined {
  return NOTE_TEMPLATES.find((t) => t.id === id);
}
