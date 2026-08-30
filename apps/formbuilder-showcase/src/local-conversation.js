const DEMO_VALUES = {
  "form-field:full-name": "Lukas",
  "form-field:email": "lukas@example.com",
  "form-field:role": "Developer",
  "form-field:access-needs": "Step-free access, please."
};

export async function replyToShowcaseTurn(turn) {
  if (!turn.focus) {
    return {
      message: "Point to a field first. I will use only that bounded focus instead of the page.",
      speak: "Point to a field first.",
      offers: []
    };
  }

  const value = DEMO_VALUES[turn.focus.targetId];
  const canSetValue = turn.focus.capabilityIds.includes("form.set_value");
  if (!value || !canSetValue) {
    return {
      message: `I can explain ${turn.focus.label}, but I do not have a safe value offer for it.`,
      speak: `I can explain ${turn.focus.label}.`,
      offers: []
    };
  }

  return {
    message: `I can set ${turn.focus.label} to ${value}. Click the visible offer to approve it.`,
    speak: `I have one suggestion for ${turn.focus.label}.`,
    offers: [
      {
        capabilityId: "form.set_value",
        targetId: turn.focus.targetId,
        value,
        summary: `Set ${turn.focus.label} to ${value}`
      }
    ]
  };
}
