import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptRoot = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptRoot, "..");
const publicRoots = [
  join(webRoot, "app"),
  join(webRoot, "components", "content"),
  join(webRoot, "components", "official-site"),
];
const ignoredDirectories = new Set(["api", "ui"]);
const placeholderTags = new Set(["input", "textarea", "Input", "Textarea", "SelectValue"]);
const rules = {
  "em-dash": /[—–]/u,
  "scroll-cue": /\bScroll(?:\s+to\s+explore)?\b/iu,
  "version-footer": /\bv\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?\b/iu,
};

export function scanVisibleCopySource(source, filePath = "source.tsx") {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const variables = collectVariables(sourceFile);
  const candidates = extractVisibleCandidates(sourceFile, variables);
  const findings = [];

  for (const candidate of candidates) {
    for (const [rule, pattern] of Object.entries(rules)) {
      if (pattern.test(candidate.text)) {
        findings.push(toFinding(filePath, source, candidate.index, rule, candidate.text));
      }
    }
  }

  const sectionNumbers = candidates
    .map((candidate) => ({ ...candidate, number: parseSectionNumber(candidate.text) }))
    .filter((candidate) => candidate.number !== null);
  for (let index = 0; index <= sectionNumbers.length - 3; index += 1) {
    const first = sectionNumbers[index];
    const second = sectionNumbers[index + 1];
    const third = sectionNumbers[index + 2];
    if (first.number + 1 === second.number && second.number + 1 === third.number) {
      findings.push(toFinding(
        filePath,
        source,
        first.index,
        "section-number",
        `${first.text} / ${second.text} / ${third.text}`,
      ));
      break;
    }
  }

  findings.push(...findPlaceholderLabels(sourceFile, source, filePath));
  return findings;
}

function collectVariables(sourceFile) {
  const variables = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      variables.set(node.name.text, unwrapExpression(node.initializer));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return variables;
}

function extractVisibleCandidates(sourceFile, variables) {
  const candidates = [];
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      collectJsx(node, new Map(), candidates, sourceFile, variables);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return candidates;
}

function collectJsx(node, bindings, candidates, sourceFile, variables) {
  for (const child of node.children) {
    if (ts.isJsxText(child)) {
      addCandidate(candidates, child.text, child.getStart(sourceFile));
    } else if (ts.isJsxExpression(child) && child.expression) {
      collectExpression(child.expression, bindings, candidates, sourceFile, variables);
    } else if (ts.isJsxElement(child) || ts.isJsxFragment(child)) {
      collectJsx(child, bindings, candidates, sourceFile, variables);
    }
  }
}

function collectExpression(expression, bindings, candidates, sourceFile, variables) {
  const node = unwrapExpression(expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    addCandidate(candidates, node.text, node.getStart(sourceFile));
    return;
  }
  if (ts.isIdentifier(node)) {
    const boundValues = bindings.get(node.text)?.get("$self");
    if (boundValues) {
      for (const value of boundValues) addCandidate(candidates, value.text, value.index);
      return;
    }
    const initializer = variables.get(node.text);
    if (initializer && (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer))) {
      addCandidate(candidates, initializer.text, initializer.getStart(sourceFile));
    }
    return;
  }
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    const values = bindings.get(node.expression.text)?.get(node.name.text);
    if (values) for (const value of values) addCandidate(candidates, value.text, value.index);
    return;
  }
  if (ts.isTemplateExpression(node)) {
    addCandidate(candidates, node.head.text, node.head.getStart(sourceFile));
    for (const span of node.templateSpans) {
      collectExpression(span.expression, bindings, candidates, sourceFile, variables);
      addCandidate(candidates, span.literal.text, span.literal.getStart(sourceFile));
    }
    return;
  }
  if (ts.isBinaryExpression(node)) {
    collectExpression(node.left, bindings, candidates, sourceFile, variables);
    collectExpression(node.right, bindings, candidates, sourceFile, variables);
    return;
  }
  if (ts.isConditionalExpression(node)) {
    collectExpression(node.whenTrue, bindings, candidates, sourceFile, variables);
    collectExpression(node.whenFalse, bindings, candidates, sourceFile, variables);
    return;
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && node.expression.name.text === "map") {
    collectMapExpression(node, bindings, candidates, sourceFile, variables);
    return;
  }
  if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
    collectJsx(node, bindings, candidates, sourceFile, variables);
  }
}

function collectMapExpression(call, bindings, candidates, sourceFile, variables) {
  const receiver = unwrapExpression(call.expression.expression);
  const callback = call.arguments[0];
  if (!callback || (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback))) return;
  const array = resolveArray(receiver, variables);
  if (!array) return;

  const nextBindings = new Map(bindings);
  const parameter = callback.parameters[0]?.name;
  if (parameter && ts.isIdentifier(parameter)) {
    nextBindings.set(parameter.text, valuesByProperty(array, sourceFile));
  } else if (parameter && ts.isObjectBindingPattern(parameter)) {
    for (const element of parameter.elements) {
      if (!ts.isIdentifier(element.name)) continue;
      const propertyName = element.propertyName && ts.isIdentifier(element.propertyName)
        ? element.propertyName.text
        : element.name.text;
      const values = valuesByProperty(array, sourceFile).get(propertyName);
      if (values) nextBindings.set(element.name.text, new Map([["$self", values]]));
    }
  }

  if (ts.isBlock(callback.body)) {
    const visitReturn = (node) => {
      if (ts.isReturnStatement(node) && node.expression) {
        collectExpression(node.expression, nextBindings, candidates, sourceFile, variables);
        return;
      }
      ts.forEachChild(node, visitReturn);
    };
    visitReturn(callback.body);
  } else {
    collectExpression(callback.body, nextBindings, candidates, sourceFile, variables);
  }
}

function resolveArray(expression, variables) {
  const node = ts.isIdentifier(expression) ? variables.get(expression.text) : expression;
  const unwrapped = node ? unwrapExpression(node) : undefined;
  return unwrapped && ts.isArrayLiteralExpression(unwrapped) ? unwrapped : null;
}

function valuesByProperty(array, sourceFile) {
  const values = new Map();
  const self = [];
  for (const element of array.elements) {
    const item = unwrapExpression(element);
    if (ts.isStringLiteral(item) || ts.isNoSubstitutionTemplateLiteral(item)) {
      self.push({ text: item.text, index: item.getStart(sourceFile) });
      continue;
    }
    if (!ts.isObjectLiteralExpression(item)) continue;
    for (const property of item.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = propertyNameText(property.name);
      const value = unwrapExpression(property.initializer);
      if (!name || (!ts.isStringLiteral(value) && !ts.isNoSubstitutionTemplateLiteral(value))) continue;
      const propertyValues = values.get(name) ?? [];
      propertyValues.push({ text: value.text, index: value.getStart(sourceFile) });
      values.set(name, propertyValues);
    }
  }
  if (self.length > 0) values.set("$self", self);
  return values;
}

function propertyNameText(name) {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)
    ? name.text
    : null;
}

function unwrapExpression(node) {
  let current = node;
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current)
    || ts.isSatisfiesExpression(current) || ts.isNonNullExpression(current)) {
    current = current.expression;
  }
  return current;
}

function addCandidate(candidates, text, index) {
  const normalized = text.trim();
  if (normalized) candidates.push({ text: normalized, index });
}

function parseSectionNumber(text) {
  const match = text.match(/^\s*(?:section\s*)?0([1-9])(?:\s|[./:\u00b7-]|$)/iu);
  return match ? Number(match[1]) : null;
}

function findPlaceholderLabels(sourceFile, source, filePath) {
  const findings = [];
  const visit = (node) => {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node))
      && placeholderTags.has(node.tagName.getText(sourceFile))
      && hasAttribute(node.attributes, "placeholder")) {
      const field = findFieldAncestor(node, sourceFile);
      if (!field || !hasVisibleLabel(field, sourceFile)) {
        findings.push(toFinding(
          filePath,
          source,
          node.getStart(sourceFile),
          "placeholder-as-label",
          "输入框 placeholder 缺少可见标签",
        ));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

function hasAttribute(attributes, name) {
  return attributes.properties.some((attribute) =>
    ts.isJsxAttribute(attribute) && attribute.name.text === name);
}

function findFieldAncestor(node, sourceFile) {
  let current = node.parent;
  while (current) {
    if (ts.isJsxElement(current) && current.openingElement.tagName.getText(sourceFile) === "Field") {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function hasVisibleLabel(field, sourceFile) {
  let visible = false;
  const visit = (node) => {
    if (visible) return;
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName.getText(sourceFile);
      if ((tag === "label" || tag === "FieldLabel")
        && !hasScreenReaderOnlyClass(node.openingElement.attributes)
        && jsxTextContent(node).trim()) {
        visible = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(field);
  return visible;
}

function hasScreenReaderOnlyClass(attributes) {
  const attribute = attributes.properties.find((item) =>
    ts.isJsxAttribute(item) && item.name.text === "className");
  if (!attribute || !ts.isJsxAttribute(attribute) || !attribute.initializer) return false;
  if (ts.isStringLiteral(attribute.initializer)) return /(?:^|\s)sr-only(?:\s|$)/u.test(attribute.initializer.text);
  if (ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) {
    const expression = unwrapExpression(attribute.initializer.expression);
    return (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))
      && /(?:^|\s)sr-only(?:\s|$)/u.test(expression.text);
  }
  return false;
}

function jsxTextContent(node) {
  return node.children.map((child) => {
    if (ts.isJsxText(child)) return child.text;
    if (ts.isJsxExpression(child) && child.expression) {
      const expression = unwrapExpression(child.expression);
      if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
    }
    return "";
  }).join(" ");
}

function toFinding(filePath, source, index, rule, text) {
  return {
    filePath,
    line: source.slice(0, index).split("\n").length,
    rule,
    text: text.replace(/\s+/gu, " ").slice(0, 120),
  };
}

function collectTsxFiles(root) {
  if (!statSync(root).isDirectory()) return root.endsWith(".tsx") ? [root] : [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];
    const path = join(root, entry.name);
    if (entry.isDirectory()) return collectTsxFiles(path);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [path] : [];
  });
}

export function scanVisibleCopyFiles(roots = publicRoots) {
  return roots.flatMap((root) => collectTsxFiles(root).flatMap((filePath) =>
    scanVisibleCopySource(readFileSync(filePath, "utf8"), relative(webRoot, filePath))));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = scanVisibleCopyFiles();
  if (findings.length === 0) {
    console.log("Visible copy check passed.");
  } else {
    for (const finding of findings) {
      console.error(`${finding.filePath}:${finding.line} [${finding.rule}] ${finding.text}`);
    }
    process.exitCode = 1;
  }
}
