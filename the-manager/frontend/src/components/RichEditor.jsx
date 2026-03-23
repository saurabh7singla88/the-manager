import { useRef, useState } from 'react';
import { Box, IconButton, Tooltip, TextField, Typography } from '@mui/material';
import {
  FormatBold, FormatUnderlined, FormatListBulleted, FormatListNumbered,
} from '@mui/icons-material';

// ── Formatting helpers ────────────────────────────────────────────────────────

function applyInline(value, ss, se, open, close) {
  const selected = value.slice(ss, se);
  if (selected) {
    if (selected.startsWith(open) && selected.endsWith(close)) {
      const inner = selected.slice(open.length, selected.length - close.length);
      return { newValue: value.slice(0, ss) + inner + value.slice(se), newStart: ss, newEnd: ss + inner.length };
    }
    const wrapped = open + selected + close;
    return { newValue: value.slice(0, ss) + wrapped + value.slice(se), newStart: ss, newEnd: ss + wrapped.length };
  }
  return { newValue: value.slice(0, ss) + open + close + value.slice(se), newStart: ss + open.length, newEnd: ss + open.length };
}

function applyBlock(value, ss, se, prefix) {
  const lineStart = value.lastIndexOf('\n', ss - 1) + 1;
  const afterSel = value.indexOf('\n', se);
  const lineEnd = afterSel === -1 ? value.length : afterSel;
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const alreadyAll = lines.every(l => l.startsWith(prefix));
  const transformed = alreadyAll
    ? lines.map(l => l.startsWith(prefix) ? l.slice(prefix.length) : l)
    : lines.map(l => l.startsWith(prefix) ? l : prefix + l);
  const newBlock = transformed.join('\n');
  return { newValue: value.slice(0, lineStart) + newBlock + value.slice(lineEnd), newStart: lineStart, newEnd: lineStart + newBlock.length };
}

function applyNumbered(value, ss, se) {
  const lineStart = value.lastIndexOf('\n', ss - 1) + 1;
  const afterSel = value.indexOf('\n', se);
  const lineEnd = afterSel === -1 ? value.length : afterSel;
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const alreadyAll = lines.every(l => /^\d+\.\s/.test(l));
  const transformed = alreadyAll
    ? lines.map(l => l.replace(/^\d+\.\s/, ''))
    : lines.map((l, i) => /^\d+\.\s/.test(l) ? l : `${i + 1}. ${l}`);
  const newBlock = transformed.join('\n');
  return { newValue: value.slice(0, lineStart) + newBlock + value.slice(lineEnd), newStart: lineStart, newEnd: lineStart + newBlock.length };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RichEditor({ value = '', onChange, onKeyDown: externalOnKeyDown, onSubmit, label, variant, sx, InputProps, ...textFieldProps }) {
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);

  // Standard variant = inline/borderless mode (used inside full-page editors)
  const isStandard = variant === 'standard';

  const apply = (fn) => {
    const el = inputRef.current;
    if (!el) return;
    const { selectionStart: ss, selectionEnd: se } = el;
    const { newValue, newStart, newEnd } = fn(value, ss, se);
    onChange({ target: { value: newValue } });
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newStart, newEnd);
      }
    });
  };

  const btnSx = {
    p: '5px', borderRadius: 1.5, color: '#64748b',
    '&:hover': { bgcolor: '#ede9fe', color: '#6366f1' },
    transition: 'background 0.12s, color 0.12s',
  };

  // Border/focus colours vary by mode
  const borderColor = focused ? '#6366f1' : (isStandard ? 'transparent' : '#e2e8f0');
  const boxShadow   = focused ? (isStandard ? 'none' : '0 0 0 3px #e0e7ff') : 'none';

  return (
    <Box>
      {label && (
        <Typography
          variant="caption"
          sx={{ color: focused ? '#6366f1' : 'text.secondary', fontWeight: 500, mb: 0.5, display: 'block', transition: 'color 0.15s' }}
        >
          {label}
        </Typography>
      )}

      {/* Unified container — owns the focus ring */}
      <Box
        sx={{
          borderRadius: isStandard ? 0 : '10px',
          border: isStandard ? 'none' : `1.5px solid ${borderColor}`,
          boxShadow,
          transition: 'border-color 0.15s, box-shadow 0.15s',
          bgcolor: isStandard ? 'transparent' : '#fff',
          overflow: 'hidden',
        }}
      >
        {/* Formatting toolbar */}
        <Box
          sx={{
            display: 'flex', alignItems: 'center', gap: 0.5,
            px: 1, py: 0.5,
            bgcolor: isStandard ? '#f8fafc' : (focused ? '#faf9ff' : '#f8fafc'),
            borderBottom: `1px solid ${isStandard && focused ? '#c7d2fe' : '#e2e8f0'}`,
            transition: 'background 0.15s, border-color 0.15s',
          }}
        >
          <Tooltip title="Bold (Ctrl+B)">
            <IconButton size="small" sx={btnSx}
              onMouseDown={e => { e.preventDefault(); apply((v, ss, se) => applyInline(v, ss, se, '**', '**')); }}>
              <FormatBold sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Underline">
            <IconButton size="small" sx={btnSx}
              onMouseDown={e => { e.preventDefault(); apply((v, ss, se) => applyInline(v, ss, se, '<u>', '</u>')); }}>
              <FormatUnderlined sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
          <Box sx={{ width: 1, height: 16, bgcolor: '#cbd5e1', mx: 0.25 }} />
          <Tooltip title="Bullet list (- )">
            <IconButton size="small" sx={btnSx}
              onMouseDown={e => { e.preventDefault(); apply((v, ss, se) => applyBlock(v, ss, se, '- ')); }}>
              <FormatListBulleted sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Numbered list">
            <IconButton size="small" sx={btnSx}
              onMouseDown={e => { e.preventDefault(); apply((v, ss, se) => applyNumbered(v, ss, se)); }}>
              <FormatListNumbered sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
          <Typography
            variant="caption"
            sx={{ ml: 'auto', color: 'text.disabled', fontSize: '0.68rem', display: { xs: 'none', sm: 'block' }, userSelect: 'none' }}
          >
            Ctrl+B bold
          </Typography>
        </Box>

        {/* Text input */}
        <TextField
          {...textFieldProps}
          variant={isStandard ? 'standard' : 'outlined'}
          value={value}
          onChange={onChange}
          inputRef={inputRef}
          InputProps={{
            ...InputProps,
            ...(isStandard ? { disableUnderline: true } : {}),
            sx: {
              borderRadius: 0,
              fontSize: '0.95rem',
              lineHeight: 1.75,
              ...(InputProps?.sx || {}),
            },
          }}
          onFocus={e => { setFocused(true); InputProps?.onFocus?.(e); }}
          onBlur={e => { setFocused(false); InputProps?.onBlur?.(e); }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
              const el = inputRef.current;
              if (!el) return;
              const ss = el.selectionStart;
              const lineStart = value.lastIndexOf('\n', ss - 1) + 1;
              const currentLine = value.slice(lineStart, ss);
              // Match indented bullets and numbered items (industry standard: preserve indent level)
              const bulletMatch = currentLine.match(/^(\s*)(- )(.*)/);
              const numberedMatch = currentLine.match(/^(\s*)(\d+)\.\s(.*)/);
              if (bulletMatch) {
                const indent = bulletMatch[1];
                const content = bulletMatch[3];
                e.preventDefault();
                if (content.trim() === '') {
                  if (indent.length > 0) {
                    // Dedent one level on empty indented bullet (like Word/Notion)
                    const newIndent = indent.slice(3);
                    const newLine = newIndent + '- ';
                    const newValue = value.slice(0, lineStart) + newLine + value.slice(ss);
                    const newPos = lineStart + newLine.length;
                    onChange({ target: { value: newValue } });
                    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(newPos, newPos); });
                  } else {
                    // Top-level empty bullet → exit list
                    const newValue = value.slice(0, lineStart) + '\n' + value.slice(ss);
                    onChange({ target: { value: newValue } });
                    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(lineStart + 1, lineStart + 1); });
                  }
                } else {
                  const insert = '\n' + indent + '- ';
                  const newValue = value.slice(0, ss) + insert + value.slice(ss);
                  const newPos = ss + insert.length;
                  onChange({ target: { value: newValue } });
                  requestAnimationFrame(() => { el.focus(); el.setSelectionRange(newPos, newPos); });
                }
                return;
              }
              if (numberedMatch) {
                const indent = numberedMatch[1];
                const num = parseInt(numberedMatch[2], 10);
                const content = numberedMatch[3];
                e.preventDefault();
                if (content.trim() === '') {
                  if (indent.length > 0) {
                    // Dedent one level on empty indented item — continue parent numbering
                    const newIndent = indent.slice(3);
                    const prevLines = value.slice(0, lineStart).split('\n');
                    let nextNum = 1;
                    for (let i = prevLines.length - 1; i >= 0; i--) {
                      const m = prevLines[i].match(/^(\s*)(\d+)\.\s/);
                      if (m && m[1] === newIndent) { nextNum = parseInt(m[2], 10) + 1; break; }
                    }
                    const newLine = newIndent + nextNum + '. ';
                    const newValue = value.slice(0, lineStart) + newLine + value.slice(ss);
                    const newPos = lineStart + newLine.length;
                    onChange({ target: { value: newValue } });
                    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(newPos, newPos); });
                  } else {
                    // Top-level empty number → exit list
                    const newValue = value.slice(0, lineStart) + '\n' + value.slice(ss);
                    onChange({ target: { value: newValue } });
                    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(lineStart + 1, lineStart + 1); });
                  }
                } else {
                  const insert = '\n' + indent + (num + 1) + '. ';
                  const newValue = value.slice(0, ss) + insert + value.slice(ss);
                  const newPos = ss + insert.length;
                  onChange({ target: { value: newValue } });
                  requestAnimationFrame(() => { el.focus(); el.setSelectionRange(newPos, newPos); });
                }
                return;
              }
            }
            if (e.key === 'Tab') {
              e.preventDefault();
              const el = inputRef.current;
              if (!el) return;
              const ss = el.selectionStart;
              const lineStart = value.lastIndexOf('\n', ss - 1) + 1;
              const lineEnd = value.indexOf('\n', ss);
              const lineEndActual = lineEnd === -1 ? value.length : lineEnd;
              const currentLine = value.slice(lineStart, lineEndActual);

              if (/^(\s*)(- |\d+\.\s)/.test(currentLine)) {
                let newLine;
                if (e.shiftKey) {
                  const dedented = currentLine.replace(/^   /, '');
                  if (dedented === currentLine) return;
                  newLine = dedented;
                } else {
                  newLine = '   ' + currentLine;
                }
                // If numbered, renumber to match position at the new indent level
                const numMatch = newLine.match(/^(\s*)(\d+)\.\s(.*)$/);
                if (numMatch) {
                  const newIndent = numMatch[1];
                  const prevLines = value.slice(0, lineStart).split('\n');
                  let nextNum = 1;
                  for (let i = prevLines.length - 1; i >= 0; i--) {
                    const m = prevLines[i].match(/^(\s*)(\d+)\.\s/);
                    if (m && m[1] === newIndent) { nextNum = parseInt(m[2], 10) + 1; break; }
                  }
                  newLine = newIndent + nextNum + '. ' + numMatch[3];
                }
                const indentDelta = e.shiftKey ? -3 : 3;
                const newValue = value.slice(0, lineStart) + newLine + value.slice(lineEndActual);
                const newPos = Math.max(lineStart, Math.min(ss + indentDelta, lineStart + newLine.length));
                onChange({ target: { value: newValue } });
                requestAnimationFrame(() => { el.focus(); el.setSelectionRange(newPos, newPos); });
                return;
              }
              // Non-list line: insert 2 spaces
              const insert = '  ';
              const newValue = value.slice(0, ss) + insert + value.slice(ss);
              onChange({ target: { value: newValue } });
              requestAnimationFrame(() => { el.focus(); el.setSelectionRange(ss + 2, ss + 2); });
              return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
              e.preventDefault();
              apply((v, ss, se) => applyInline(v, ss, se, '**', '**'));
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              onSubmit?.();
            }
            externalOnKeyDown?.(e);
          }}
          sx={{
            width: '100%',
            '& .MuiOutlinedInput-root': {
              borderRadius: 0,
              '& fieldset': { border: 'none' },
            },
            '& .MuiInputBase-root': { alignItems: 'flex-start' },
            '& textarea': { resize: 'none', px: 0.5, py: 0.5, lineHeight: 1.75 },
            ...sx,
          }}
        />
      </Box>
    </Box>
  );
}
