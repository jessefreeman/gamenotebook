import {
  HighlightStyle,
  LanguageSupport,
  StreamLanguage,
  type StreamParser,
  type StringStream,
  syntaxHighlighting,
} from "@codemirror/language"
import { tags } from "@lezer/highlight"

const BASIC_KEYWORDS = new Set([
  "AND",
  "CLS",
  "COLOR",
  "DIM",
  "ELSE",
  "END",
  "FOR",
  "GOSUB",
  "GOTO",
  "IF",
  "INPUT",
  "LET",
  "LINE",
  "LOCATE",
  "MOD",
  "NEXT",
  "NOT",
  "OR",
  "PRINT",
  "PSET",
  "RECT",
  "REM",
  "RETURN",
  "STEP",
  "STOP",
  "THEN",
  "TO",
])

const BASIC_FUNCTIONS = new Set([
  "ABS",
  "ASC",
  "CHR$",
  "INKEY$",
  "INT",
  "LEN",
  "RND",
  "STR$",
  "VAL",
])

const readBasicString = (stream: StringStream) => {
  stream.next()

  while (!stream.eol()) {
    const char = stream.next()
    if (char !== "\"") continue

    // BASIC uses "" for escaped quotes inside strings.
    if (stream.peek() === "\"") {
      stream.next()
      continue
    }
    break
  }
}

const BASIC_STREAM_PARSER: StreamParser<null> = {
  token(stream) {
    if (stream.sol()) {
      // Optional legacy line numbers at line-start.
      if (stream.match(/\d+\b/)) return "number"
    }

    if (stream.eatSpace()) return null

    const char = stream.peek()
    if (char === "'") {
      stream.skipToEnd()
      return "comment"
    }

    if (char === "\"") {
      readBasicString(stream)
      return "string"
    }

    if (stream.match(/\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/)) return "number"
    if (stream.match(/\.\d+(?:[eE][+-]?\d+)?/)) return "number"

    if (stream.match(/<>|<=|>=|=|<|>|\+|-|\*|\//)) return "operator"
    if (stream.match(/[(),:;]/)) return "punctuation"

    if (stream.match(/[A-Za-z_][A-Za-z0-9_$]*/)) {
      const token = stream.current().toUpperCase()

      if (token === "REM") {
        stream.skipToEnd()
        return "comment"
      }

      if (BASIC_KEYWORDS.has(token)) return "keyword"
      if (BASIC_FUNCTIONS.has(token)) return "builtin"
      return "variableName"
    }

    stream.next()
    return null
  },
  languageData: {
    commentTokens: { line: "'" },
  },
}

const basicStreamLanguage = StreamLanguage.define(BASIC_STREAM_PARSER)

const basicLightHighlightStyle = HighlightStyle.define(
  [
    { tag: tags.keyword, color: "#6d28d9", fontWeight: "600" },
    { tag: tags.operator, color: "#be123c" },
    { tag: tags.standard(tags.variableName), color: "#1d4ed8", fontWeight: "600" },
    { tag: tags.string, color: "#0f766e" },
    { tag: tags.number, color: "#b45309" },
    { tag: tags.comment, color: "#6b7280", fontStyle: "italic" },
  ],
  { scope: basicStreamLanguage, themeType: "light" }
)

const basicDarkHighlightStyle = HighlightStyle.define(
  [
    { tag: tags.keyword, color: "#c4b5fd", fontWeight: "600" },
    { tag: tags.operator, color: "#fda4af" },
    { tag: tags.standard(tags.variableName), color: "#93c5fd", fontWeight: "600" },
    { tag: tags.string, color: "#6ee7b7" },
    { tag: tags.number, color: "#f59e0b" },
    { tag: tags.comment, color: "#9ca3af", fontStyle: "italic" },
  ],
  { scope: basicStreamLanguage, themeType: "dark" }
)

const basicLanguageSupport = new LanguageSupport(basicStreamLanguage, [
  syntaxHighlighting(basicLightHighlightStyle),
  syntaxHighlighting(basicDarkHighlightStyle),
])

export const basicLanguage = () => basicLanguageSupport
