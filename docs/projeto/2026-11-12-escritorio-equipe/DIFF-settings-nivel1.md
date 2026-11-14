# Diff proposto do settings.json (gate G4) - NADA FOI APLICADO

Gerado em 2026-11-13 por `npm run settings:diff -- --level 1` (e `--level 2`), que apenas lê
`C:\Users\carlo\.claude\settings.json` e não grava nada. A chave `env` não aparece (não muda).

## O que muda (Nível 1 - recomendado)

- Mescla ADITIVA: os grupos do Pixel Agents ficam intactos, na frente; um grupo do Escritório é
  acrescentado depois deles em 11 eventos que já existem e 2 eventos novos são criados
  (`UserPromptSubmit`, `TaskCreated`). Nada é removido. `TeammateIdle`, `agent`, `env` e
  `statusLine` não mudam.
- Comando: `node "C:/Users/carlo/.escritorio-equipe/bin/escritorio-hook.cjs"` (contém o marcador
  `.escritorio-equipe`, que o `settings:revert` usa para remover só o que é nosso).
- Timeout 3 s nos observacionais; 75 s no `PermissionRequest` (prazo de aprovação 60 s + 15 s).
  Nesta fase o hook é só observacional (sai 0, sem stdout); a decisão bloqueante é a T-47.
- O hook só envia nomes e ids (nunca `tool_input`, prompts, respostas ou saídas).

## Como aplicar (só com o OK do Carlos)

1. `npm run build` e `npm run hooks:sync` (copia o hook para `~/.escritorio-equipe/bin`; não toca o settings).
2. `npm run settings:apply -- --level 1 --i-am-carlo-and-approved` e digitar `APLICAR`
   (backup `settings.json.bak-AAAAMMDD-HHMMSS` ao lado do arquivo; JSON validado depois de gravar).
3. Desfazer: `npm run settings:revert -- --i-am-carlo-and-approved` (restaura os bytes do backup).

Sem a flag longa o `apply`/`revert` recusam o arquivo real.

## Diff - Nível 1

```diff
--- settings.json (atual)
+++ settings.json (proposto, nível 1)
@@ -18,6 +18,16 @@
             "timeout": 5
           }
         ]
+      },
+      {
+        "matcher": "",
+        "hooks": [
+          {
+            "type": "command",
+            "command": "node \"C:/Users/carlo/.escritorio-equipe/bin/escritorio-hook.cjs\"",
+            "timeout": 3
+          }
+        ]
       }
     ],
     "SessionEnd": [
@@ -30,6 +40,16 @@
             "timeout": 5
           }
         ]
+      },
+      {
+        "matcher": "",
+        "hooks": [
+          {
+            "type": "command",
+            "command": "node \"C:/Users/carlo/.escritorio-equipe/bin/escritorio-hook.cjs\"",
+            "timeout": 3
+          }
+        ]
       }
     ],
     "Stop": [
@@ -42,6 +62,16 @@
             "timeout": 5
           }
         ]
+      },
+      {
+        "matcher": "",
+        "hooks": [
+          {
+            "type": "command",
+            "command": "node \"C:/Users/carlo/.escritorio-equipe/bin/escritorio-hook.cjs\"",
+            "timeout": 3
+          }
+        ]
       }
     ],
     "PermissionRequest": [
@@ -54,6 +84,16 @@
             "timeout": 5
           }
         ]
+      },
+      {
+        "matcher": "",
+        "hooks": [
+          {
+            "type": "command",
+            "command": "node \"C:/Users/carlo/.escritorio-equipe/bin/escritorio-hook.cjs\"",
+            "timeout": 75
+          }
+        ]
       }
     ],
     "Notification": [
@@ -66,6 +106,16 @@
             "timeout": 5
           }
         ]
+      },
+      {
+        "matcher": "",
+        "hooks": [
+          {
+            "type": "command",
+            "command": "node \"C:/Users/carlo/.escritorio-equipe/bin/escritorio-hook.cjs\"",
+            "timeout": 3
+          }
+        ]
       }
     ],
     "PreToolUse": [
@@ -78,6 +128,16 @@
             "timeout": 5
           }
         ]
+      },
+      {
+        "matcher": "",
+        "hooks": [
+          {
+            "type": "command",
+            "command": "node \"C:/Users/carlo/.escritorio-equipe/bin/escritorio-hook.cjs\"",
+            "timeout": 3
+          }
+        ]
       }
     ],
     "PostToolUse": [
@@ -90,6 +150,16 @@
             "timeout": 5
           }
         ]
+      },
+      {
+        "matcher": "",
+        "hooks": [
+          {
+            "type": "command",
+            "command": "node \"C:/Users/carlo/.escritorio-equipe/bin/escritorio-hook.cjs\"",
+            "timeout": 3
+          }
+        ]
       }
     ],
     "PostToolUseFailure": [
@@ -102,6 +172,16 @@
             "timeout": 5
           }
         ]
+      },
+      {
+        "matcher": "",
+        "hooks": [
+          {
+            "type": "command",
+            "command": "node \"C:/Users/carlo/.escritorio-equipe/bin/escritorio-hook.cjs\"",
+            "timeout": 3
+          }
+        ]
       }
     ],
     "SubagentStart": [
@@ -114,6 +194,16 @@
             "timeout": 5
           }
         ]
+      },
+      {
+        "matcher": "",
+        "hooks": [
+          {
+            "type": "command",
+            "command": "node \"C:/Users/carlo/.escritorio-equipe/bin/escritorio-hook.cjs\"",
+            "timeout": 3
+          }
+        ]
       }
     ],
     "SubagentStop": [
@@ -126,6 +216,16 @@
             "timeout": 5
           }
         ]
+      },
+      {
+        "matcher": "",
+        "hooks": [
+          {
+            "type": "command",
+            "command": "node \"C:/Users/carlo/.escritorio-equipe/bin/escritorio-hook.cjs\"",
+            "timeout": 3
+          }
+        ]
       }
     ],
     "TeammateIdle": [
@@ -150,7 +250,41 @@
             "timeout": 5
           }
         ]
+      },
+      {
+        "matcher": "",
+        "hooks": [
+          {
+            "type": "command",
+            "command": "node \"C:/Users/carlo/.escritorio-equipe/bin/escritorio-hook.cjs\"",
+            "timeout": 3
+          }
+        ]
       }
+    ],
+    "UserPromptSubmit": [
+      {
+        "matcher": "",
+        "hooks": [
+          {
+            "type": "command",
+            "command": "node \"C:/Users/carlo/.escritorio-equipe/bin/escritorio-hook.cjs\"",
+            "timeout": 3
+          }
+        ]
+      }
+    ],
+    "TaskCreated": [
+      {
+        "matcher": "",
+        "hooks": [
+          {
+            "type": "command",
+            "command": "node \"C:/Users/carlo/.escritorio-equipe/bin/escritorio-hook.cjs\"",
+            "timeout": 3
+          }
+        ]
+      }
     ]
   }
 }
```

## Diff - Nível 2 (opcional, fase 3; exige o script da statusLine, T-65, que ainda não existe)

```diff
--- settings.json (atual)
+++ settings.json (proposto, nível 2)
@@ -5,7 +5,7 @@
   },
   "statusLine": {
     "type": "command",
-    "command": "node \"C:\\Users\\carlo\\.pixel-agents\\hooks\\claude-statusline.js\""
+    "command": "node \"C:/Users/carlo/.escritorio-equipe/bin/escritorio-statusline.cjs\" --wrap bm9kZSAiQzpcVXNlcnNcY2FybG9cLnBpeGVsLWFnZW50c1xob29rc1xjbGF1ZGUtc3RhdHVzbGluZS5qcyI"
   },
   "hooks": {
     "SessionStart": [
```
