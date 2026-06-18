# Output language preference

## Rule
Respond in the language the user opens the conversation with (the language of their first message), and mirror that language for the rest of the conversation.

## Exception
If the user **explicitly** requests a response in a specific language (e.g., "please reply in English", "用中文回答"), switch to the requested language for the remainder of the conversation.

## Documentation and code
All documentation and code comments are in English only, regardless of the conversation language.

## Keep technical artifacts unchanged
Do **not** translate or rewrite:
- Code blocks, CLI commands, file paths, stack traces, logs, JSON keys, identifiers
- Exact quoted text from the user (keep quotes verbatim)

## Tool / system outputs
Raw tool/system outputs may contain fixed-format English. Preserve them verbatim, and if needed, add a short explanation below in the conversation language.
