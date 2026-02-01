define("rhai", ["require", "require"], (require) => {
  "use strict";

  var moduleExports = (() => {
    var r = Object.defineProperty;
    var i = Object.getOwnPropertyDescriptor;
    var a = Object.getOwnPropertyNames;
    var c = Object.prototype.hasOwnProperty;
    var _ = (t, e) => {
      for (var n in e) r(t, n, { get: e[n], enumerable: !0 });
    };
    var u = (t, e, n, s) => {
      if (e && typeof e == "object" || typeof e == "function")
        for (let o of a(e))
          !c.call(t, o) && o !== n && r(t, o, {
            get: () => e[o],
            enumerable: !(s = i(e, o)) || s.enumerable
          });
      return t;
    };
    var l = t => u(r({}, "__esModule", { value: !0 }), t);
    var m = {};

    _(m, {
      conf: () => f,
      language: () => p
    });

    var f = {
      comments: {
        lineComment: "//",
        blockComment: ["/*", "*/"]
      },
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
      ],
      autoClosingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: '"', close: '"', notIn: ["string"] },
        { open: "'", close: "'", notIn: ["string", "comment"] },
        { open: "`", close: "`", notIn: ["string", "comment"] }
      ],
      surroundingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
        { open: "`", close: "`" }
      ]
    };

    var p = {
      tokenPostfix: ".rhai",
      defaultToken: "invalid",

      keywords: [
        'const', 'let', 'return', 'if', 'else', 'switch', 'throw', 'try', 'catch',
        'for', 'in', 'loop', 'do', 'while', 'until', 'break', 'continue',
        'import', 'export', 'as', 'fn', 'private'
      ],

      constants: [
        'true', 'false', 'this'
      ],

      supportFunctions: [
        'print', 'debug', 'call', 'curry', 'eval', 'type_of',
        'is_def_var', 'is_def_fn', 'is_shared'
      ],

      invalidKeywords: [
        'var', 'static', 'shared', 'goto', 'exit', 'match', 'case', 'public',
        'protected', 'new', 'use', 'with', 'module', 'package', 'super',
        'thread', 'spawn', 'go', 'await', 'async', 'sync', 'yield',
        'default', 'void', 'null', 'nil'
      ],

      operators: [
        // Assignment operators
        '=', '+=', '-=', '*=', '/=', '%=', '**=', '&=', '|=', '^=', '<<=', '>>=',

        // Arithmetic operators
        '+', '-', '*', '/', '%', '**',

        // Comparison operators
        '==', '!=', '<', '<=', '>', '>=',

        // Logical operators
        '&&', '||', '!',

        // Bitwise operators
        '&', '|', '^', '<<', '>>',

        // Other operators
        '.', '=>', ':', '::'
      ],

      symbols: /[=><!~?:&|+\-*\/\^%]+/,

      escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

      tokenizer: {
        root: [
          // identifiers and keywords
          [/[a-z_$][\w$]*/, {
            cases: {
              '@keywords': 'keyword',
              '@constants': 'constant',
              '@supportFunctions': 'support.function',
              '@invalidKeywords': 'invalid',
              '@default': 'identifier'
            }
          }],
          [/[A-Z][\w\$]*/, 'type.identifier'], // constants and types

          // whitespace
          { include: '@whitespace' },

          // delimiters and operators
          [/[{}()\[\]]/, '@brackets'],
          [/@symbols/, {
            cases: {
              '@operators': 'operator',
              '@default': ''
            }
          }],

          // numbers
          [/\b0b[01][01_]*\b/, 'number.binary'],
          [/\b0o[0-7][0-7_]*\b/, 'number.octal'],
          [/\b0x[0-9a-fA-F][0-9a-fA-F_]*\b/, 'number.hex'],
          [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
          [/\d+/, 'number'],

          // delimiter: after number because of .\d floats
          [/[;,.]/, 'delimiter'],

          // strings
          [/'([^'\\]|\\.)*$/, 'string.invalid'],  // non-terminated string
          [/'/, { token: 'string.quote', bracket: '@open', next: '@string_single' }],
          [/"/, { token: 'string.quote', bracket: '@open', next: '@string_double' }],
          [/`/, { token: 'string.quote', bracket: '@open', next: '@template_string' }],

          // comments
          [/\/\*/, 'comment', '@comment'],
          [/\/\/.*$/, 'comment'],
          [/(\/\/\/).*$/, 'comment.doc'],
        ],

        comment: [
          [/[^\/*]+/, 'comment'],
          [/\/\*/, 'comment', '@push'],
          ["\\*/", 'comment', '@pop'],
          [/[\/*]/, 'comment']
        ],

        string_single: [
          [/[^\\']+/, 'string'],
          [/@escapes/, 'string.escape'],
          [/\\./, 'string.escape.invalid'],
          [/'/, { token: 'string.quote', bracket: '@close', next: '@pop' }]
        ],

        string_double: [
          [/[^\\"]+/, 'string'],
          [/@escapes/, 'string.escape'],
          [/\\./, 'string.escape.invalid'],
          [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }]
        ],

        template_string: [
          [/[^\\`$]+/, 'string'],
          [/@escapes/, 'string.escape'],
          [/\\./, 'string.escape.invalid'],
          [/\$\{/, { token: 'delimiter.interpolation', bracket: '@open', next: '@interpolation' }],
          [/`/, { token: 'string.quote', bracket: '@close', next: '@pop' }]
        ],

        interpolation: [
          [/\}/, { token: 'delimiter.interpolation', bracket: '@close', next: '@pop' }],
          { include: '@root' }
        ],

        whitespace: [
          [/[ \t\r\n]+/, 'white'],
          [/\/\*/, 'comment', '@comment'],
          [/\/\/.*$/, 'comment'],
          [/(\/\/\/).*$/, 'comment.doc'],
        ],
      },
    };

    return l(m);
  })();

  return moduleExports;
});
