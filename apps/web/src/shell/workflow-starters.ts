type WorkflowRosterMember = {
  handle: string;
  name: string;
  availability: string;
};

export type WorkflowStarter = {
  label: string;
  prompt: string;
};

function available(member: WorkflowRosterMember): boolean {
  return member.availability === "available";
}

export function buildWorkflowStarters(roster: readonly WorkflowRosterMember[]): WorkflowStarter[] {
  const members = roster.filter(available);
  const analyst = members.find((member) => /analyst|research/i.test(member.handle));
  const operator = members.find((member) => /operator|builder/i.test(member.handle));
  const starters: WorkflowStarter[] = [];

  if (analyst) {
    starters.push({
      label: "Analyze evidence",
      prompt: `@${analyst.handle} Review the available evidence and prepare a sourced briefing with the key patterns and next steps.`,
    });
  }
  if (operator) {
    starters.push({
      label: "Build an action plan",
      prompt: `@${operator.handle} Review this channel and prepare a concise action plan. Ask before making any external change.`,
    });
  }
  if (members.length > 1) {
    starters.push({
      label: "Coordinate the team",
      prompt:
        "@team Review the current workspace and coordinate a launch-readiness plan with owners, risks, and next actions.",
    });
  }
  if (starters.length === 0 && members[0]) {
    starters.push({
      label: `Ask ${members[0].name}`,
      prompt: `@${members[0].handle} Review this channel and recommend the most useful next action.`,
    });
  }

  return starters.slice(0, 3);
}
