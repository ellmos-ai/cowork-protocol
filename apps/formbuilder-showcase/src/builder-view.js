// New Cowork Protocol challenge work. This module is the FormBuilder Studio
// product UI: Build, Fill and Export tabs over the form-builder.mjs core. It
// has no Cowork Protocol import anywhere in this file — the app works this
// way with no agent, no WebMCP and no browser extension. See
// ../INTEGRATION.md for how a small, separate layer (builder-cowork.js, wired
// in from app.js) attaches Cowork on top without touching this file's model.

import {
  buildFormSchema,
  classificationDisplayName,
  classificationOf,
  createField,
  emptyBuilderState,
  FIELD_TYPE_PALETTE,
  FormBuilderError,
  insertField,
  moveField,
  removeField,
  setHeadingLevel,
  updateField
} from "./form-builder.mjs";
import { buildResponse, isInputType, parseSchema, validateRequired } from "./form-engine.mjs";
import { buildFlatOdt } from "./fodt-export.mjs";

const TABS = ["build", "fill", "export"];

function slugify(text) {
  const slug = text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "form";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Initializes the FormBuilder Studio UI inside `root` (defaults to `document`).
 *  Returns a small controller so an optional integration layer (e.g. Cowork)
 *  can read the current elements and apply an already-decided mutation; this
 *  module never calls back into that controller itself. */
export function initBuilderStudio(root = document) {
  const $ = (selector) => root.querySelector(selector);

  let state = emptyBuilderState();
  let pageVersion = 1;
  const fillValues = {};
  let lastResponse = null;
  const pageVersionListeners = [];

  function bumpPageVersion() {
    pageVersion += 1;
    $("#builder-page-version").textContent = String(pageVersion);
    for (const listener of pageVersionListeners) listener(pageVersion);
  }

  function setStatus(message) {
    $("#builder-status").textContent = message;
  }

  function renderPaletteOptions() {
    const select = $("#builder-field-type");
    select.textContent = "";
    for (const entry of FIELD_TYPE_PALETTE) {
      const option = document.createElement("option");
      option.value = entry.paletteId;
      option.textContent = entry.displayName;
      select.append(option);
    }
  }

  function currentControl(row) {
    return row.querySelector("input, textarea, select");
  }

  function renderFieldRow(element, index, total) {
    const row = document.createElement("li");
    const classification = classificationOf(element);
    const isInput = isInputType(classification);
    const heading = classification === "heading-h1" || classification === "heading-h2";

    // Same integration boundary the fixed demo form uses (data-field-id /
    // data-label, D-20260830-002): this is what makes one builder field an
    // addressable focus and offer target instead of only the whole canvas
    // being addressable (GAP-00). builder-view.js stays Cowork-free even so -
    // these are plain DOM attributes, not a protocol import.
    row.className = "builder-field-row form-field";
    row.dataset.fieldId = element.id;
    row.dataset.label = element.label || classificationDisplayName(classification);
    row.dataset.controlKind = classification;

    const head = document.createElement("div");
    head.className = "builder-field-row-head";
    const kind = document.createElement("span");
    kind.className = "builder-field-kind";
    // GAP-08: never the raw schema typeString (e.g. "Textfeld (Lang)") - every
    // long-answer field would otherwise show the identical badge text.
    kind.textContent = classificationDisplayName(classification);
    head.append(kind);
    row.append(head);

    if (classification !== "separator") {
      const labelField = document.createElement("label");
      const labelText = document.createElement("span");
      labelText.textContent = classification === "description" ? "Text" : "Label";
      const labelInput = document.createElement("input");
      labelInput.value = element.label ?? "";
      labelInput.setAttribute("aria-label", `${labelText.textContent} for field ${index + 1}`);
      labelInput.addEventListener("change", () => {
        state.elements = updateField(state.elements, element.id, { label: labelInput.value });
        row.dataset.label = labelInput.value;
        bumpPageVersion();
        renderFillTab();
      });
      labelField.append(labelText, labelInput);
      row.append(labelField);
    }

    if (heading) {
      const levelLabel = document.createElement("label");
      const levelText = document.createElement("span");
      levelText.textContent = "Heading level";
      const levelSelect = document.createElement("select");
      levelSelect.setAttribute("aria-label", `Heading level for field ${index + 1}`);
      for (const level of [1, 2]) {
        const option = document.createElement("option");
        option.value = String(level);
        option.textContent = `H${level}`;
        levelSelect.append(option);
      }
      levelSelect.value = classification === "heading-h1" ? "1" : "2";
      levelSelect.addEventListener("change", () => {
        state.elements = setHeadingLevel(state.elements, element.id, Number(levelSelect.value));
        renderFieldList();
        renderFillTab();
      });
      levelLabel.append(levelText, levelSelect);
      row.append(levelLabel);
    }

    if (isInput) {
      const requiredLabel = document.createElement("label");
      requiredLabel.className = "check-row compact-check";
      const requiredInput = document.createElement("input");
      requiredInput.type = "checkbox";
      requiredInput.checked = element.required === true;
      requiredInput.setAttribute("aria-label", `Required for field ${index + 1}`);
      requiredInput.addEventListener("change", () => {
        state.elements = updateField(state.elements, element.id, { required: requiredInput.checked });
        renderFillTab();
      });
      requiredLabel.append(requiredInput, document.createTextNode(" Required"));
      row.append(requiredLabel);

      const helpField = document.createElement("label");
      const helpText = document.createElement("span");
      helpText.textContent = "Help text (optional)";
      const helpInput = document.createElement("input");
      helpInput.value = element.helpText ?? "";
      helpInput.maxLength = 200;
      helpInput.setAttribute("aria-label", `Help text for field ${index + 1}`);
      helpInput.addEventListener("change", () => {
        state.elements = updateField(state.elements, element.id, { helpText: helpInput.value });
        renderFillTab();
      });
      helpField.append(helpText, helpInput);
      row.append(helpField);
    }

    if (classification === "checkbox-single" || classification === "checkbox-multi") {
      const optionsField = document.createElement("label");
      const optionsText = document.createElement("span");
      optionsText.textContent = "Options (comma-separated)";
      const optionsInput = document.createElement("input");
      optionsInput.value = (element.options ?? []).join(", ");
      optionsInput.setAttribute("aria-label", `Options for field ${index + 1}`);
      optionsInput.addEventListener("change", () => {
        const options = optionsInput.value
          .split(",")
          .map((option) => option.trim())
          .filter((option) => option.length > 0);
        state.elements = updateField(state.elements, element.id, {
          options: options.length > 0 ? options : ["Option 1"]
        });
        renderFillTab();
      });
      optionsField.append(optionsText, optionsInput);
      row.append(optionsField);
    }

    const controls = document.createElement("div");
    controls.className = "builder-field-controls";
    const up = document.createElement("button");
    up.type = "button";
    up.textContent = "↑";
    up.setAttribute("aria-label", `Move field ${index + 1} up`);
    up.disabled = index === 0;
    up.addEventListener("click", () => {
      state.elements = moveField(state.elements, element.id, "up");
      renderFieldList();
      renderFillTab();
    });

    const down = document.createElement("button");
    down.type = "button";
    down.textContent = "↓";
    down.setAttribute("aria-label", `Move field ${index + 1} down`);
    down.disabled = index === total - 1;
    down.addEventListener("click", () => {
      state.elements = moveField(state.elements, element.id, "down");
      renderFieldList();
      renderFillTab();
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove field ${index + 1}: ${element.label || element.type}`);
    remove.addEventListener("click", () => {
      state.elements = removeField(state.elements, element.id);
      delete fillValues[element.id];
      bumpPageVersion();
      renderFieldList();
      renderFillTab();
    });

    controls.append(up, down, remove);
    row.append(controls);
    return row;
  }

  function renderFieldList() {
    const list = $("#builder-field-list");
    list.textContent = "";
    state.elements.forEach((element, index) => {
      list.append(renderFieldRow(element, index, state.elements.length));
    });
    $("#builder-empty-state").hidden = state.elements.length > 0;
    $("#builder-suggest-rename").hidden = state.elements.length === 0;
    $("#builder-suggest-move").hidden = state.elements.length < 2;
  }

  function renderFillField(element) {
    const classification = classificationOf(element);
    const wrapper = document.createElement("div");
    wrapper.className = "builder-fill-field";
    wrapper.dataset.fieldId = element.id;

    if (classification === "heading-h1" || classification === "heading-h2") {
      const tag = classification === "heading-h1" ? "h2" : "h3";
      const heading = document.createElement(tag);
      heading.textContent = element.label ?? "";
      wrapper.append(heading);
      return wrapper;
    }
    if (classification === "description") {
      const description = document.createElement("p");
      description.className = "form-intro";
      description.textContent = element.label ?? "";
      wrapper.append(description);
      return wrapper;
    }
    if (classification === "separator") {
      wrapper.append(document.createElement("hr"));
      return wrapper;
    }

    const label = document.createElement("label");
    const labelText = document.createElement("span");
    labelText.textContent = `${element.label ?? ""}${element.required ? " *" : ""}`;
    label.append(labelText);

    let control;
    if (classification === "text-long") {
      control = document.createElement("textarea");
      control.rows = 4;
    } else if (classification === "date") {
      control = document.createElement("input");
      control.type = "date";
    } else if (classification === "checkbox-single") {
      control = document.createElement("select");
      const blank = document.createElement("option");
      blank.value = "";
      blank.textContent = "Choose one";
      control.append(blank);
      for (const option of element.options ?? []) {
        const optionElement = document.createElement("option");
        optionElement.textContent = option;
        control.append(optionElement);
      }
    } else if (classification === "checkbox-multi") {
      control = document.createElement("div");
      control.className = "builder-checkbox-group";
      for (const option of element.options ?? []) {
        const optionLabel = document.createElement("label");
        optionLabel.className = "check-row";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = option;
        checkbox.checked = (fillValues[element.id] ?? []).includes(option);
        checkbox.addEventListener("change", () => {
          const current = new Set(fillValues[element.id] ?? []);
          if (checkbox.checked) current.add(option);
          else current.delete(option);
          fillValues[element.id] = [...current];
        });
        optionLabel.append(checkbox, document.createTextNode(` ${option}`));
        control.append(optionLabel);
      }
    } else {
      control = document.createElement("input");
      control.type = "text";
    }

    if (control.tagName !== "DIV") {
      control.id = `builder-fill-${element.id}`;
      control.required = element.required === true;
      control.value = fillValues[element.id] ?? "";
      control.addEventListener("input", () => {
        fillValues[element.id] = control.value;
      });
    }
    label.append(control);
    wrapper.append(label);
    if (element.helpText) {
      const help = document.createElement("p");
      help.className = "field-help";
      help.textContent = element.helpText;
      wrapper.append(help);
    }
    return wrapper;
  }

  function renderFillTab() {
    $("#builder-fill-title").textContent = state.title;
    const form = $("#builder-fill-form");
    const submitButton = form.querySelector("button[type=submit]");
    form.textContent = "";
    if (state.elements.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Nothing to fill in yet. Add a field in the Build tab first.";
      form.append(empty);
    } else {
      for (const element of state.elements) {
        form.append(renderFillField(element));
      }
    }
    // The submit button is a permanent part of the form: it must survive
    // every re-render, including the empty state, or it is lost for good
    // once form.textContent = "" has detached it.
    form.append(submitButton);
    $("#builder-form-result").hidden = true;
  }

  function loadSchemaJson(text) {
    let json;
    try {
      json = JSON.parse(text);
    } catch (error) {
      setStatus(`Could not read that as JSON: ${error.message}`);
      return;
    }
    try {
      const parsed = parseSchema(json);
      state = { title: parsed.title, elements: parsed.elements };
      for (const key of Object.keys(fillValues)) delete fillValues[key];
      bumpPageVersion();
      $("#builder-form-title").value = state.title;
      renderFieldList();
      renderFillTab();
      setStatus(`Loaded "${state.title}" with ${state.elements.length} field(s).`);
    } catch (error) {
      setStatus(`${error instanceof FormBuilderError ? error.code : "INVALID_SCHEMA"}: ${error.message}`);
    }
  }

  function wireBuildTab() {
    renderPaletteOptions();
    $("#builder-form-title").addEventListener("change", (event) => {
      state.title = event.target.value.trim() || "Untitled form";
      bumpPageVersion();
      renderFillTab();
    });
    $("#builder-add-field").addEventListener("click", () => {
      const paletteId = $("#builder-field-type").value;
      const field = createField(paletteId);
      state.elements = insertField(state.elements, field);
      bumpPageVersion();
      renderFieldList();
      renderFillTab();
      setStatus(`Added "${field.type}".`);
    });
    $("#builder-load-paste-button").addEventListener("click", () => {
      loadSchemaJson($("#builder-load-paste").value);
    });
    $("#builder-load-file-button").addEventListener("click", () => {
      $("#builder-load-file-input").click();
    });
    $("#builder-load-file-input").addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      loadSchemaJson(await file.text());
      event.target.value = "";
    });
  }

  function wireFillTab() {
    $("#builder-fill-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const missing = validateRequired(state.elements, fillValues);
      root.querySelectorAll(".builder-fill-field").forEach((field) => field.classList.remove("has-error"));
      if (missing.length > 0) {
        for (const item of missing) {
          $(`.builder-fill-field[data-field-id="${CSS.escape(item.id ?? "")}"]`)?.classList.add("has-error");
        }
        setStatus(`${missing.length} required field(s) missing.`);
        return;
      }
      lastResponse = buildResponse(state.title, state.elements, fillValues);
      $("#builder-response-json").textContent = JSON.stringify(lastResponse, null, 2);
      $("#builder-form-result").hidden = false;
      $("#builder-export-response").disabled = false;
      setStatus("Form is valid. Switch to Export to download it.");
    });
  }

  function wireExportTab() {
    $("#builder-export-schema").addEventListener("click", () => {
      const schema = buildFormSchema(state.title, state.elements);
      downloadBlob(
        new Blob([JSON.stringify(schema, null, 2)], { type: "application/json" }),
        `${slugify(state.title)}-form.json`
      );
    });
    $("#builder-export-response").addEventListener("click", () => {
      if (!lastResponse) return;
      downloadBlob(
        new Blob([JSON.stringify(lastResponse, null, 2)], { type: "application/json" }),
        `${slugify(state.title)}-response.json`
      );
    });
    $("#builder-export-fodt").addEventListener("click", () => {
      const fodt = buildFlatOdt({ title: state.title, elements: state.elements });
      downloadBlob(
        new Blob([fodt], { type: "application/vnd.oasis.opendocument.text" }),
        `${slugify(state.title)}.fodt`
      );
    });
  }

  function wireTabs() {
    for (const tab of TABS) {
      $(`#builder-tab-${tab}`).addEventListener("click", () => switchTab(tab));
    }
  }

  function switchTab(tab) {
    for (const name of TABS) {
      $(`#builder-tab-${name}`).setAttribute("aria-selected", String(name === tab));
      $(`#builder-panel-${name}`).hidden = name !== tab;
    }
  }

  wireTabs();
  wireBuildTab();
  wireFillTab();
  wireExportTab();
  renderFieldList();
  renderFillTab();

  return {
    getElements: () => state.elements,
    getTitle: () => state.title,
    getPageVersion: () => pageVersion,
    applyElements(nextElements) {
      state.elements = nextElements;
      bumpPageVersion();
      renderFieldList();
      renderFillTab();
    },
    onPageVersionChange(listener) {
      pageVersionListeners.push(listener);
    }
  };
}
