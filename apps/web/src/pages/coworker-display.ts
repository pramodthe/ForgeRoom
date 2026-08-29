type CoworkerDisplayInput = {
  handle: string;
  toolGrants: readonly string[];
};

const READ_PATTERN = /(GET|LIST|READ|SEARCH|FETCH|QUERY)/;
const WRITE_PATTERN = /(CREATE|UPDATE|WRITE|PUBLISH|SEND|DELETE|REMOVE|RUN)/;
const PRESENTATION_PATTERN = /(TABLE|CHART|ARTIFACT|RENDER)/;

export function coworkerDisplaySummary(input: CoworkerDisplayInput): string {
  const tools = input.toolGrants.map((tool) => tool.toUpperCase());
  const canRead = tools.some((tool) => READ_PATTERN.test(tool));
  const canWrite = tools.some((tool) => WRITE_PATTERN.test(tool));
  const canPresent = tools.some((tool) => PRESENTATION_PATTERN.test(tool));

  if (tools.length === 0) {
    return "Works from shared channel context without access to connected tools.";
  }
  if (canRead && !canWrite && canPresent) {
    return "Finds evidence across connected sources and turns it into clear, sourced briefings.";
  }
  if (canRead && !canWrite) {
    return "Researches connected sources and returns evidence without changing external systems.";
  }
  if (canWrite && canPresent) {
    return "Turns decisions into governed work and presents sensitive changes for approval.";
  }
  if (canWrite) {
    return "Carries out bounded workflows and asks before sensitive external changes.";
  }
  if (input.handle.toLowerCase().includes("research")) {
    return "Researches the shared workspace and returns a focused, evidence-led briefing.";
  }
  return "Handles a focused role with explicit tools, limits, and visible work history.";
}
