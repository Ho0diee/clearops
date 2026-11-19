import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  Calendar,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  Folder,
  FolderPlus,
  GripVertical,
  Layers,
  Lightbulb,
  Lock,
  Pencil,
  Receipt,
  RotateCcw,
  Search,
  SquarePen,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { formatShortDate, useOpsStore } from '../../store/opsStore';
import { countCoveredTasks, getBlockingBottleneck } from '../../store/ideaBlocking';
import { formatFriendlyTime } from '../../store/scheduleAi';
import type {
  ArchiveOutcome,
  CalendarBlock,
  IdeaItem,
  IdeaResponsibilityType,
} from '../../types/schema';

type SmartFolderId = '__BOTTLENECKS__' | string;
type MobileNotesPane = 'folders' | 'list' | 'note';
type ArchiveOutcomeFilter = 'all' | ArchiveOutcome;

const RESPONSIBILITY_CYCLE: (IdeaResponsibilityType | undefined)[] = [
  'paid',
  'cost',
  'time-saving',
  undefined,
];

function nextResponsibilityType(
  current?: IdeaResponsibilityType
): IdeaResponsibilityType | undefined {
  const idx = RESPONSIBILITY_CYCLE.indexOf(current);
  return RESPONSIBILITY_CYCLE[(idx + 1) % RESPONSIBILITY_CYCLE.length];
}

function responsibilityLabel(type?: IdeaResponsibilityType, earnedAmount?: number): string {
  if (type === 'paid') {
    if (typeof earnedAmount === 'number' && Number.isFinite(earnedAmount)) {
      const formatted =
        earnedAmount % 1 === 0
          ? earnedAmount.toLocaleString('en-US', { maximumFractionDigits: 0 })
          : earnedAmount.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
      return `Paid · $${formatted}`;
    }
    return 'Paid';
  }
  if (type === 'cost') return 'Cost';
  if (type === 'time-saving') return 'Time-Saving';
  return 'None';
}

function isOpenEmptyZone(b: CalendarBlock): boolean {
  if (b.kind !== 'empty-zone' || b.completed) return false;
  if (b.assignedIdeaId || b.assignedGoalId) return false;
  return /open focus slot|reclaimed focus slot|^empty zone$/i.test(b.title.trim());
}

function getNoteBody(item: IdeaItem): string {
  if (item.notes !== undefined) return item.notes;
  if (
    item.startingStep &&
    item.startingStep !== 'Define concrete 15-minute opening action'
  ) {
    return item.startingStep;
  }
  return '';
}

function getPreviewSnippet(item: IdeaItem): string {
  const body = getNoteBody(item).trim();
  if (!body) return 'No additional text';
  const firstLine = body
    .split('\n')
    .map((l) => l.replace(/^[•\-*]\s*/, '').trim())
    .find(Boolean);
  return firstLine || 'No additional text';
}

function extractFirstStepHint(body: string): string {
  const firstLine = body
    .split('\n')
    .map((l) => l.replace(/^[•\-*]\s*/, '').trim())
    .find(Boolean);
  return firstLine ? firstLine.slice(0, 90) : '';
}

export const IdeasHubView: React.FC = () => {
  const { state, actions, todayIso } = useOpsStore();

  const [selectedFolder, setSelectedFolder] = useState<SmartFolderId>(
    () => state.projects[0] || '__BOTTLENECKS__'
  );
  const [inArchiveMode, setInArchiveMode] = useState(false);
  const [archiveOutcomeFilter, setArchiveOutcomeFilter] = useState<ArchiveOutcomeFilter>('all');
  const [archivePromptOpen, setArchivePromptOpen] = useState(false);
  const [earnedDraft, setEarnedDraft] = useState('');
  const [earnedMissingError, setEarnedMissingError] = useState(false);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<MobileNotesPane>('folders');

  const [searchQuery, setSearchQuery] = useState('');
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolders, setEditingFolders] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renamingContext, setRenamingContext] = useState<'list' | 'heading'>('list');
  const [renameFolderDraft, setRenameFolderDraft] = useState('');
  const [zonePickerOpen, setZonePickerOpen] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [dragState, setDragState] = useState<{
    id: string;
    pointerId: number;
    startY: number;
    dy: number;
    fromIdx: number;
    overIdx: number;
    rowH: number;
  } | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const titleInputRef = useRef<HTMLTextAreaElement | null>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const newFolderInputRef = useRef<HTMLInputElement | null>(null);
  const renameFolderInputRef = useRef<HTMLInputElement | null>(null);
  const earnedInputRef = useRef<HTMLInputElement | null>(null);
  const pendingCursorRef = useRef<number | null>(null);

  const allNotes = useMemo(
    () => state.ideas.filter((i) => i.status !== 'completed'),
    [state.ideas]
  );

  const archivedNotes = useMemo(
    () =>
      state.ideas
        .filter((i) => i.status === 'completed')
        .sort((a, b) => {
          const ta = a.archivedAt || a.updatedAt || a.createdAt;
          const tb = b.archivedAt || b.updatedAt || b.createdAt;
          return tb.localeCompare(ta);
        }),
    [state.ideas]
  );

  // Exact same folder layout inside Archive (active folders in order + any historical folder with archived notes)
  const archiveProjects = useMemo(
    () => Array.from(new Set([...state.projects, ...archivedNotes.map((i) => i.project)])),
    [state.projects, archivedNotes]
  );

  const bottleneckCount = useMemo(
    () => allNotes.filter((i) => i.isBottleneck).length,
    [allNotes]
  );

  const archivedBottleneckCount = useMemo(
    () => archivedNotes.filter((i) => i.isBottleneck).length,
    [archivedNotes]
  );

  const folderNotes = useMemo(() => {
    const sourcePool = inArchiveMode ? archivedNotes : allNotes;
    let base: IdeaItem[];
    if (selectedFolder === '__BOTTLENECKS__') {
      base = sourcePool
        .filter((i) => i.isBottleneck)
        .sort((a, b) =>
          inArchiveMode
            ? 0
            : a.project !== b.project
            ? a.project.localeCompare(b.project)
            : a.priorityRank - b.priorityRank
        );
    } else {
      base = sourcePool
        .filter((i) => i.project === selectedFolder)
        .sort((a, b) => (inArchiveMode ? 0 : a.priorityRank - b.priorityRank));
    }

    if (inArchiveMode && archiveOutcomeFilter !== 'all') {
      base = base.filter((i) => {
        const effOutcome: ArchiveOutcome = i.archivedOutcome ?? 'completed';
        return effOutcome === archiveOutcomeFilter;
      });
    }

    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter((i) => {
      const hay = `${i.title} ${getNoteBody(i)} ${i.project}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allNotes, archivedNotes, inArchiveMode, selectedFolder, archiveOutcomeFilter, searchQuery]);

  const startRenamingFolder = (proj: string, context: 'list' | 'heading') => {
    setRenamingFolder(proj);
    setRenamingContext(context);
    setRenameFolderDraft(proj);
    window.setTimeout(() => {
      renameFolderInputRef.current?.focus();
      renameFolderInputRef.current?.select();
    }, 20);
  };

  const cancelRenamingFolder = () => {
    setRenamingFolder(null);
    setRenameFolderDraft('');
  };

  const commitRenameFolder = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!renamingFolder) return;
    const oldName = renamingFolder;
    const nextName = renameFolderDraft.trim();
    if (!nextName || nextName === oldName) {
      cancelRenamingFolder();
      return;
    }
    const ok = actions.renameProject(oldName, nextName);
    if (ok) {
      if (selectedFolder === oldName) {
        setSelectedFolder(nextName);
      }
      cancelRenamingFolder();
    }
  };

  const isArchiveFolder = inArchiveMode;
  const canReorder =
    selectedFolder !== '__BOTTLENECKS__' && !isArchiveFolder && !searchQuery.trim();

  // Which notes are covered by a higher-priority blocking bottleneck
  const blockedByMap = useMemo(() => {
    const map = new Map<string, IdeaItem>();
    allNotes.forEach((n) => {
      const blocker = getBlockingBottleneck(n, allNotes);
      if (blocker) map.set(n.id, blocker);
    });
    return map;
  }, [allNotes]);

  const activeNote = useMemo(
    () => folderNotes.find((n) => n.id === selectedNoteId) ?? folderNotes[0] ?? null,
    [folderNotes, selectedNoteId]
  );

  const openNoteRecord = useMemo(
    () => (selectedNoteId ? state.ideas.find((n) => n.id === selectedNoteId) ?? null : null),
    [state.ideas, selectedNoteId]
  );

  // Open Empty Zones available on the calendar (today & upcoming)
  const openEmptyZones = useMemo(
    () =>
      state.blocks
        .filter((b) => isOpenEmptyZone(b) && b.date >= todayIso)
        .sort((a, b) =>
          a.date !== b.date ? a.date.localeCompare(b.date) : a.startTime.localeCompare(b.startTime)
        ),
    [state.blocks, todayIso]
  );

  const folderDisplayName =
    selectedFolder === '__BOTTLENECKS__' ? 'Bottlenecks' : selectedFolder;

  // Cleanup blank untitled note when navigating away (Apple Notes behavior)
  const cleanupBlankNoteIfEmpty = (noteId: string | null) => {
    if (!noteId) return;
    const item = state.ideas.find((i) => i.id === noteId);
    if (item && item.status !== 'completed' && !item.title.trim() && !getNoteBody(item).trim()) {
      actions.deleteIdea(item.id);
    }
  };

  const openFolder = (folderId: SmartFolderId, archiveFlag = inArchiveMode) => {
    cleanupBlankNoteIfEmpty(selectedNoteId);
    setInArchiveMode(archiveFlag);
    setSelectedFolder(folderId);
    setSearchQuery('');
    setZonePickerOpen(false);
    setArchivePromptOpen(false);
    setReordering(false);
    setDragState(null);
    setMobilePane('list');
    const pool = archiveFlag ? archivedNotes : allNotes;
    const firstInFolder =
      folderId === '__BOTTLENECKS__'
        ? pool.find((i) => i.isBottleneck)
        : pool.find((i) => i.project === folderId);
    setSelectedNoteId(firstInFolder?.id ?? null);
  };

  const enterArchiveMode = () => {
    cleanupBlankNoteIfEmpty(selectedNoteId);
    setInArchiveMode(true);
    setArchiveOutcomeFilter('all');
    setSearchQuery('');
    setZonePickerOpen(false);
    setArchivePromptOpen(false);
    setEditingFolders(false);
    setAddingFolder(false);
    setReordering(false);
    setDragState(null);
    // Pick the first folder with archived notes (or first folder in layout) for desktop preview
    const defaultArchiveFolder =
      archiveProjects.find((p) => archivedNotes.some((n) => n.project === p)) ||
      archiveProjects[0] ||
      '__BOTTLENECKS__';
    setSelectedFolder(defaultArchiveFolder);
    const firstArchived = archivedNotes.find((n) => n.project === defaultArchiveFolder) ?? null;
    setSelectedNoteId(firstArchived?.id ?? null);
    setMobilePane('folders');
  };

  const exitArchiveMode = () => {
    setInArchiveMode(false);
    setArchiveOutcomeFilter('all');
    setSearchQuery('');
    setArchivePromptOpen(false);
    const defaultActive = state.projects[0] || '__BOTTLENECKS__';
    setSelectedFolder(defaultActive);
    const firstActive =
      defaultActive === '__BOTTLENECKS__'
        ? allNotes.find((i) => i.isBottleneck)
        : allNotes.find((i) => i.project === defaultActive);
    setSelectedNoteId(firstActive?.id ?? null);
    setMobilePane('folders');
  };

  const openNote = (noteId: string) => {
    if (selectedNoteId && selectedNoteId !== noteId) {
      cleanupBlankNoteIfEmpty(selectedNoteId);
    }
    setSelectedNoteId(noteId);
    setZonePickerOpen(false);
    setArchivePromptOpen(false);
    setMobilePane('note');
  };

  /* ---------- Priority drag-to-reorder (grip handle, iPhone friendly) ---------- */
  const onGripPointerDown = (e: React.PointerEvent<HTMLSpanElement>, id: string, idx: number) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const rowEl = rowRefs.current.get(id);
    const rowH = rowEl?.getBoundingClientRect().height || 64;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    try {
      navigator.vibrate?.(8);
    } catch {
      /* ignore */
    }
    setDragState({
      id,
      pointerId: e.pointerId,
      startY: e.clientY,
      dy: 0,
      fromIdx: idx,
      overIdx: idx,
      rowH,
    });
  };

  const onGripPointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    e.preventDefault();
    const maxIdx = folderNotes.length - 1;
    const minDy = -dragState.fromIdx * dragState.rowH;
    const maxDy = (maxIdx - dragState.fromIdx) * dragState.rowH;
    const dy = Math.max(minDy, Math.min(maxDy, e.clientY - dragState.startY));
    const overIdx = Math.max(
      0,
      Math.min(maxIdx, dragState.fromIdx + Math.round(dy / dragState.rowH))
    );
    if (overIdx !== dragState.overIdx) {
      try {
        navigator.vibrate?.(4);
      } catch {
        /* ignore */
      }
    }
    setDragState({ ...dragState, dy, overIdx });
  };

  const onGripPointerUp = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const { id, fromIdx, overIdx } = dragState;
    setDragState(null);
    if (overIdx !== fromIdx) {
      actions.setIdeaRank(id, overIdx + 1);
    }
  };

  const rowShiftFor = (idx: number, id: string): number => {
    if (!dragState) return 0;
    if (id === dragState.id) return dragState.dy;
    const { fromIdx, overIdx, rowH } = dragState;
    if (fromIdx < overIdx && idx > fromIdx && idx <= overIdx) return -rowH;
    if (fromIdx > overIdx && idx < fromIdx && idx >= overIdx) return rowH;
    return 0;
  };

  const createNewNote = () => {
    cleanupBlankNoteIfEmpty(selectedNoteId);
    const targetProject =
      selectedFolder !== '__ALL__' &&
      selectedFolder !== '__BOTTLENECKS__' &&
      state.projects.includes(selectedFolder)
        ? selectedFolder
        : state.projects[0] || 'Personal';

    const defaultBottleneck = selectedFolder === '__BOTTLENECKS__';
    const id = actions.addIdea({
      project: targetProject,
      title: '',
      startingStep: '',
      isBottleneck: defaultBottleneck,
    });
    setSelectedNoteId(id);
    setZonePickerOpen(false);
    setMobilePane('note');
    window.setTimeout(() => titleInputRef.current?.focus(), 45);
  };

  const handleCreateFolder = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newFolderName.trim();
    if (!clean) {
      setAddingFolder(false);
      return;
    }
    actions.addProject(clean);
    setNewFolderName('');
    setAddingFolder(false);
    openFolder(clean);
  };

  useEffect(() => {
    if (addingFolder) {
      window.setTimeout(() => newFolderInputRef.current?.focus(), 30);
    }
  }, [addingFolder]);

  // Auto-size multi-line note title textarea cleanly
  useLayoutEffect(() => {
    const el = titleInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [activeNote?.id, activeNote?.title, mobilePane]);

  // Preserve exact cursor position after automatic bullet insertion/removal
  useLayoutEffect(() => {
    if (pendingCursorRef.current !== null && bodyTextareaRef.current) {
      const pos = pendingCursorRef.current;
      pendingCursorRef.current = null;
      bodyTextareaRef.current.setSelectionRange(pos, pos);
    }
  });

  const handleBodyKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    note: IdeaItem
  ) => {
    // Apple Notes-style automatic bullet list continuation ("• " or "- ")
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      const el = e.currentTarget;
      const val = el.value;
      const pos = el.selectionStart ?? val.length;
      const lineStart = val.lastIndexOf('\n', pos - 1) + 1;
      const currentLine = val.slice(lineStart, pos);
      const bulletMatch = currentLine.match(/^(\s*[•\-*]\s+)(.*)$/);
      if (bulletMatch) {
        e.preventDefault();
        const bulletPrefix = bulletMatch[1].replace(/[-*]/, '•');
        const lineContent = bulletMatch[2];
        if (!lineContent.trim()) {
          // Pressing Enter on an empty bullet exits the list cleanly
          const updated = val.slice(0, lineStart) + val.slice(pos);
          pendingCursorRef.current = lineStart;
          actions.updateIdea(note.id, {
            notes: updated,
            startingStep: extractFirstStepHint(updated),
            updatedAt: new Date().toISOString(),
          });
        } else {
          const insert = `\n${bulletPrefix}`;
          const updated = val.slice(0, pos) + insert + val.slice(pos);
          pendingCursorRef.current = pos + insert.length;
          actions.updateIdea(note.id, {
            notes: updated,
            startingStep: extractFirstStepHint(updated),
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }
  };

  const renderNoteEditor = (note: IdeaItem | null, isMobileEditor: boolean) => {
    if (!note) {
      return (
        <div className="notes-empty-editor">
          {isArchiveFolder ? (
            <>
              <Archive size={28} strokeWidth={1.6} />
              <span>Select an archived idea to look back at what it was</span>
            </>
          ) : (
            <>
              <Lightbulb size={28} strokeWidth={1.6} />
              <span>Select a note or tap Compose to start writing</span>
              <button type="button" className="notes-primary-pill" onClick={createNewNote}>
                <SquarePen size={15} />
                <span>New Note</span>
              </button>
            </>
          )}
        </div>
      );
    }

    const isArchived = note.status === 'completed';
    const scheduledBlock = state.blocks.find(
      (b) => b.assignedIdeaId === note.id && !b.completed
    );
    const bodyValue = getNoteBody(note);

    return (
      <div className="notes-editor-pane">
        <div className="notes-editor-topbar">
          {isMobileEditor ? (
            <button
              type="button"
              className="notes-back-btn"
              onClick={() => {
                cleanupBlankNoteIfEmpty(note.id);
                setZonePickerOpen(false);
                setMobilePane('list');
              }}
            >
              <ChevronLeft size={20} />
              <span>{folderDisplayName}</span>
            </button>
          ) : (
            <span className="notes-editor-crumb">{note.project}</span>
          )}

          <div className="notes-editor-top-icons">
            {isArchived ? (
              <button
                type="button"
                className="notes-archive-action-btn is-restore"
                onClick={() => {
                  actions.unarchiveIdea(note.id);
                  setZonePickerOpen(false);
                  if (isMobileEditor) {
                    setMobilePane('list');
                  }
                  setSelectedNoteId(null);
                }}
                title={`Restore note back to ${note.project}`}
              >
                <RotateCcw size={14} />
                <span>Restore</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={`notes-archive-action-btn ${archivePromptOpen ? 'is-open' : ''}`.trim()}
                  onClick={() => {
                    setZonePickerOpen(false);
                    setArchivePromptOpen((prev) => {
                      const next = !prev;
                      if (next) {
                        setEarnedMissingError(false);
                        setEarnedDraft(
                          typeof note.earnedAmountDollars === 'number'
                            ? String(note.earnedAmountDollars)
                            : ''
                        );
                        if (note.responsibilityType === 'paid') {
                          window.setTimeout(() => earnedInputRef.current?.focus(), 35);
                        }
                      }
                      return next;
                    });
                  }}
                  title="Archive as Complete or Not Complete"
                >
                  <Archive size={14} />
                  <span>Archive</span>
                </button>
                <button
                  type="button"
                  className="notes-icon-btn"
                  aria-label="New note"
                  title="New Note"
                  onClick={createNewNote}
                >
                  <SquarePen size={18} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Pure Apple Notes Paper Canvas */}
        <div className="notes-paper">
          {!isArchived && archivePromptOpen && (() => {
            const isPaidTask = note.responsibilityType === 'paid';
            const commitArchiveChoice = (outcome: ArchiveOutcome) => {
              let earnedVal: number | undefined;
              if (isPaidTask) {
                const rawClean = earnedDraft.trim().replace(/^\$/, '').replace(/,/g, '');
                const parsedNum = Number(rawClean);
                if (rawClean === '' || !Number.isFinite(parsedNum) || parsedNum < 0) {
                  setEarnedMissingError(true);
                  earnedInputRef.current?.focus();
                  return;
                }
                earnedVal = parsedNum;
              }
              actions.archiveIdea(note.id, outcome, earnedVal);
              setArchivePromptOpen(false);
              setEarnedMissingError(false);
              setZonePickerOpen(false);
              if (isMobileEditor) {
                setMobilePane('list');
              }
              setSelectedNoteId(null);
            };

            return (
              <div className="notes-archive-popover" role="region" aria-label="Archive options">
                <div className="notes-zone-popover-head">
                  <span>
                    {isPaidTask
                      ? 'How much did you make?'
                      : `Archive in ${note.project} as:`}
                  </span>
                  <button
                    type="button"
                    className="notes-icon-btn is-sm"
                    aria-label="Cancel archive"
                    onClick={() => {
                      setArchivePromptOpen(false);
                      setEarnedMissingError(false);
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>

                {isPaidTask && (
                  <div className="notes-earned-field">
                    <div
                      className={`notes-earned-input-wrap ${
                        earnedMissingError ? 'is-error' : ''
                      }`.trim()}
                    >
                      <span className="notes-earned-prefix">$</span>
                      <input
                        ref={earnedInputRef}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        className="notes-earned-input"
                        placeholder="0.00"
                        aria-label="How much did you make in dollars"
                        value={earnedDraft}
                        onChange={(e) => {
                          setEarnedDraft(e.target.value);
                          if (earnedMissingError) setEarnedMissingError(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitArchiveChoice('completed');
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="notes-earned-zero-btn"
                        onClick={() => {
                          setEarnedDraft('0');
                          setEarnedMissingError(false);
                        }}
                        title="Set earned amount to $0"
                      >
                        $0
                      </button>
                    </div>
                    {earnedMissingError && (
                      <span className="notes-earned-error">
                        Enter how much you made before archiving (or tap $0).
                      </span>
                    )}
                  </div>
                )}

                <div className="notes-archive-choice-row">
                  <button
                    type="button"
                    className="notes-archive-choice-btn is-complete"
                    onClick={() => commitArchiveChoice('completed')}
                  >
                    <Check size={14} strokeWidth={2.8} />
                    <span>Complete</span>
                  </button>
                  <button
                    type="button"
                    className="notes-archive-choice-btn is-incomplete"
                    onClick={() => commitArchiveChoice('not-completed')}
                  >
                    <Archive size={14} />
                    <span>Not Complete</span>
                  </button>
                </div>
              </div>
            );
          })()}

          {isArchived ? (
            <div className="notes-chip-row">
              <span className="notes-archived-origin-pill">
                <Folder size={12} />
                <span>{note.project}</span>
              </span>
              <button
                type="button"
                className={`notes-outcome-toggle ${
                  (note.archivedOutcome ?? 'completed') === 'completed'
                    ? 'is-complete'
                    : 'is-incomplete'
                }`.trim()}
                onClick={() =>
                  actions.updateIdea(note.id, {
                    archivedOutcome:
                      (note.archivedOutcome ?? 'completed') === 'completed'
                        ? 'not-completed'
                        : 'completed',
                  })
                }
                title="Tap to switch between Complete and Not Complete"
              >
                {(note.archivedOutcome ?? 'completed') === 'completed' ? (
                  <>
                    <Check size={12} strokeWidth={2.8} />
                    <span>Complete</span>
                  </>
                ) : (
                  <>
                    <Archive size={11} />
                    <span>Not Complete</span>
                  </>
                )}
              </button>
              {note.responsibilityType && (
                <span className={`notes-mini-badge is-${note.responsibilityType}`}>
                  {responsibilityLabel(note.responsibilityType, note.earnedAmountDollars)}
                </span>
              )}
              <span
                className={`notes-mini-badge ${
                  note.isBottleneck ? 'is-bottleneck' : 'is-archived-kind'
                }`.trim()}
              >
                {note.isBottleneck ? 'Bottleneck' : 'Idea'}
              </span>
              {note.archivedAt && (
                <span className="notes-archived-date">
                  Archived {formatShortDate(note.archivedAt.slice(0, 10))}
                </span>
              )}
            </div>
          ) : (
            /* Lightweight Pill Strip: Responsibility (Paid/Cost/Time-Saving) · Idea/Bottleneck · Empty Zone */
            <div className="notes-chip-row">
              <button
                type="button"
                className={`notes-resp-toggle ${
                  note.responsibilityType ? `is-${note.responsibilityType}` : ''
                }`.trim()}
                onClick={() =>
                  actions.updateIdea(note.id, {
                    responsibilityType: nextResponsibilityType(note.responsibilityType),
                    updatedAt: new Date().toISOString(),
                  })
                }
                title="Tap to cycle: Paid, Cost, Time-Saving, or None"
              >
                {note.responsibilityType === 'paid' ? (
                  <DollarSign size={12} />
                ) : note.responsibilityType === 'cost' ? (
                  <Receipt size={12} />
                ) : note.responsibilityType === 'time-saving' ? (
                  <Clock size={12} />
                ) : (
                  <Tag size={12} />
                )}
                <span>{responsibilityLabel(note.responsibilityType)}</span>
              </button>

              <button
                type="button"
                className={`notes-tag-toggle ${note.isBottleneck ? 'is-bottleneck' : ''}`.trim()}
                onClick={() => actions.toggleIdeaBottleneck(note.id)}
                title="Tap to switch between Idea and Bottleneck"
              >
                {note.isBottleneck ? (
                  <>
                    <AlertTriangle size={12} />
                    <span>Bottleneck</span>
                  </>
                ) : (
                  <>
                    <Lightbulb size={12} />
                    <span>Idea</span>
                  </>
                )}
              </button>

              <button
                type="button"
                className={`notes-schedule-btn ${scheduledBlock ? 'is-scheduled' : ''}`.trim()}
                onClick={() => setZonePickerOpen((prev) => !prev)}
                title="Add to an Empty Zone on your calendar"
              >
                {scheduledBlock ? <Check size={12} /> : <CalendarPlus size={12} />}
                <span>
                  {scheduledBlock
                    ? `${
                        scheduledBlock.date === todayIso
                          ? 'Today'
                          : formatShortDate(scheduledBlock.date)
                      } · ${formatFriendlyTime(scheduledBlock.startTime)}`
                    : 'Empty Zone'}
                </span>
              </button>

              {note.isBottleneck && (
                <button
                  type="button"
                  className={`notes-cover-toggle ${note.blocksBelow ? 'is-on' : ''}`.trim()}
                  onClick={() =>
                    actions.updateIdea(note.id, {
                      blocksBelow: !note.blocksBelow,
                      updatedAt: new Date().toISOString(),
                    })
                  }
                  title="Make this bottleneck cover (block) every lower-priority task in this folder"
                >
                  <Layers size={12} />
                  <span>
                    {note.blocksBelow
                      ? `Covers ${countCoveredTasks(note, allNotes)} below`
                      : 'Cover tasks below'}
                  </span>
                </button>
              )}
            </div>
          )}

          {!isArchived && blockedByMap.get(note.id) && (
            <button
              type="button"
              className="notes-blocked-strip"
              onClick={() => openNote(blockedByMap.get(note.id)!.id)}
              title="Open the bottleneck covering this task"
            >
              <Lock size={13} />
              <span>
                Blocked by “{blockedByMap.get(note.id)!.title.trim() || 'Untitled bottleneck'}”
              </span>
              <ChevronRight size={14} />
            </button>
          )}

          {/* Inline Empty Zone Picker Popover */}
          {zonePickerOpen && (
            <div className="notes-zone-popover" role="region" aria-label="Choose an Empty Zone">
              <div className="notes-zone-popover-head">
                <span>Choose an Empty Zone</span>
                <button
                  type="button"
                  className="notes-icon-btn is-sm"
                  aria-label="Close Empty Zone picker"
                  onClick={() => setZonePickerOpen(false)}
                >
                  <X size={14} />
                </button>
              </div>

              {scheduledBlock && (
                <div className="notes-scheduled-banner">
                  <button
                    type="button"
                    className="notes-scheduled-jump"
                    onClick={() => {
                      actions.setSelectedDate(scheduledBlock.date);
                      actions.setScheduleViewMode('day');
                      actions.setActiveTab('schedule');
                    }}
                  >
                    <Calendar size={14} />
                    <span>
                      View on Calendar ({formatShortDate(scheduledBlock.date)} ·{' '}
                      {formatFriendlyTime(scheduledBlock.startTime)})
                    </span>
                    <ChevronRight size={14} />
                  </button>
                  <button
                    type="button"
                    className="notes-unschedule-btn"
                    onClick={() => {
                      actions.assignIdeaToBlock(scheduledBlock.id, undefined);
                      setZonePickerOpen(false);
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}

              <div className="notes-zone-options">
                {openEmptyZones.slice(0, 4).map((z) => (
                  <button
                    key={z.id}
                    type="button"
                    className="notes-zone-option"
                    onClick={() => {
                      if (!note.title.trim()) {
                        actions.updateIdea(note.id, {
                          title: extractFirstStepHint(bodyValue) || 'Focus Work',
                        });
                      }
                      actions.assignIdeaToBlock(z.id, note.id);
                      setZonePickerOpen(false);
                    }}
                  >
                    <span className="notes-zone-day">
                      {z.date === todayIso ? 'Today' : formatShortDate(z.date)}
                    </span>
                    <span className="notes-zone-time">
                      {formatFriendlyTime(z.startTime)} – {formatFriendlyTime(z.endTime)}
                    </span>
                  </button>
                ))}

                <button
                  type="button"
                  className="notes-zone-option is-auto"
                  onClick={() => {
                    if (!note.title.trim()) {
                      actions.updateIdea(note.id, {
                        title: extractFirstStepHint(bodyValue) || 'Focus Work',
                      });
                    }
                    actions.assignIdeaToNextEmptyZone(note.id, todayIso);
                    setZonePickerOpen(false);
                  }}
                >
                  <span className="notes-zone-day">+ Next Open Empty Zone</span>
                  <span className="notes-zone-time">Auto-fit</span>
                </button>
              </div>
            </div>
          )}

          <textarea
            ref={titleInputRef}
            rows={1}
            className="notes-title-input"
            placeholder="Title"
            aria-label="Note title"
            value={note.title}
            onChange={(e) =>
              actions.updateIdea(note.id, {
                title: e.target.value.replace(/\n/g, ' '),
                updatedAt: new Date().toISOString(),
              })
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                bodyTextareaRef.current?.focus();
              }
            }}
          />

          <textarea
            ref={bodyTextareaRef}
            className="notes-body-textarea"
            placeholder="Write freely — ideas, bullet points (• ), or what's blocking you…"
            aria-label="Note body"
            value={bodyValue}
            onChange={(e) => {
              const val = e.target.value;
              actions.updateIdea(note.id, {
                notes: val,
                startingStep: extractFirstStepHint(val),
                updatedAt: new Date().toISOString(),
              });
            }}
            onKeyDown={(e) => handleBodyKeyDown(e, note)}
          />
        </div>
      </div>
    );
  };

  return (
    <div
      className={`notes-shell is-pane-${mobilePane} ${
        inArchiveMode ? 'is-archive-room' : ''
      }`.trim()}
    >
      {/* PANE 1: Folders (Active Folders OR identical Archive Folder Layout) */}
      <aside className="notes-folders-pane" aria-label={inArchiveMode ? 'Archive folders' : 'Folders'}>
        {inArchiveMode ? (
          <>
            <div className="notes-list-topbar">
              <button
                type="button"
                className="notes-back-btn"
                onClick={exitArchiveMode}
              >
                <ChevronLeft size={19} />
                <span>Folders</span>
              </button>
              <span className="notes-archive-room-chip">
                <Archive size={12} />
                <span>Archive Room</span>
              </span>
            </div>

            <div className="notes-pane-topbar">
              <h1 className="notes-large-title">Archive</h1>
            </div>

            <div className="notes-group-card">
              <button
                type="button"
                className={`notes-folder-row ${
                  selectedFolder === '__BOTTLENECKS__' ? 'is-selected' : ''
                }`.trim()}
                onClick={() => openFolder('__BOTTLENECKS__', true)}
              >
                <span className="notes-folder-icon is-amber">
                  <AlertTriangle size={16} />
                </span>
                <span className="notes-folder-name">Bottlenecks</span>
                <span className="notes-folder-count">{archivedBottleneckCount}</span>
                <ChevronRight size={16} className="notes-chevron" />
              </button>
            </div>

            <div className="notes-section-label">My Folders</div>
            <div className="notes-group-card">
              {archiveProjects.map((proj) => {
                const count = archivedNotes.filter((i) => i.project === proj).length;
                return (
                  <div
                    key={proj}
                    className={`notes-folder-row-wrap ${
                      selectedFolder === proj ? 'is-selected' : ''
                    }`.trim()}
                  >
                    <button
                      type="button"
                      className="notes-folder-row"
                      onClick={() => openFolder(proj, true)}
                    >
                      <span className="notes-folder-icon">
                        <Folder size={17} />
                      </span>
                      <span className="notes-folder-name">{proj}</span>
                      <span className="notes-folder-count">{count}</span>
                      <ChevronRight size={16} className="notes-chevron" />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="notes-pane-topbar">
              <h1 className="notes-large-title">Folders</h1>
              <div className="ops-row" style={{ gap: 4 }}>
                {state.projects.length > 0 && (
                  <button
                    type="button"
                    className="notes-text-btn"
                    onClick={() => {
                      setEditingFolders((prev) => {
                        if (prev) cancelRenamingFolder();
                        return !prev;
                      });
                    }}
                  >
                    {editingFolders ? 'Done' : 'Edit'}
                  </button>
                )}
                <button
                  type="button"
                  className="notes-icon-btn"
                  aria-label="New folder"
                  title="New Folder"
                  onClick={() => setAddingFolder(true)}
                >
                  <FolderPlus size={20} />
                </button>
              </div>
            </div>

            {addingFolder && (
              <form className="notes-new-folder-card" onSubmit={handleCreateFolder}>
                <Folder size={16} className="notes-accent-icon" />
                <input
                  ref={newFolderInputRef}
                  type="text"
                  className="notes-new-folder-input"
                  placeholder="Folder name…"
                  aria-label="New folder name"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                />
                <button
                  type="submit"
                  className="notes-icon-btn is-confirm"
                  aria-label="Create folder"
                >
                  <Check size={16} />
                </button>
                <button
                  type="button"
                  className="notes-icon-btn"
                  aria-label="Cancel new folder"
                  onClick={() => {
                    setAddingFolder(false);
                    setNewFolderName('');
                  }}
                >
                  <X size={16} />
                </button>
              </form>
            )}

            <div className="notes-group-card">
              <button
                type="button"
                className={`notes-folder-row ${
                  selectedFolder === '__BOTTLENECKS__' ? 'is-selected' : ''
                }`.trim()}
                onClick={() => openFolder('__BOTTLENECKS__', false)}
              >
                <span className="notes-folder-icon is-amber">
                  <AlertTriangle size={16} />
                </span>
                <span className="notes-folder-name">Bottlenecks</span>
                <span className="notes-folder-count">{bottleneckCount}</span>
                <ChevronRight size={16} className="notes-chevron" />
              </button>
            </div>

            <div className="notes-section-label">My Folders</div>
            <div className="notes-group-card">
              {state.projects.map((proj) => {
                const count = allNotes.filter((i) => i.project === proj).length;
                const isRenamingHere =
                  renamingFolder === proj && renamingContext === 'list';
                return (
                  <div
                    key={proj}
                    className={`notes-folder-row-wrap ${
                      selectedFolder === proj ? 'is-selected' : ''
                    }`.trim()}
                  >
                    {isRenamingHere ? (
                      <form
                        className="notes-folder-rename-form"
                        onSubmit={commitRenameFolder}
                      >
                        <span className="notes-folder-icon">
                          <Folder size={17} />
                        </span>
                        <input
                          ref={renameFolderInputRef}
                          type="text"
                          className="notes-new-folder-input"
                          aria-label={`Rename folder ${proj}`}
                          value={renameFolderDraft}
                          onChange={(e) => setRenameFolderDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelRenamingFolder();
                            }
                          }}
                        />
                        <button
                          type="submit"
                          className="notes-icon-btn is-confirm"
                          aria-label="Save folder name"
                        >
                          <Check size={15} />
                        </button>
                        <button
                          type="button"
                          className="notes-icon-btn"
                          aria-label="Cancel rename"
                          onClick={cancelRenamingFolder}
                        >
                          <X size={15} />
                        </button>
                      </form>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="notes-folder-row"
                          onClick={() => {
                            if (editingFolders) {
                              startRenamingFolder(proj, 'list');
                            } else {
                              openFolder(proj, false);
                            }
                          }}
                        >
                          <span className="notes-folder-icon">
                            <Folder size={17} />
                          </span>
                          <span className="notes-folder-name">{proj}</span>
                          {!editingFolders && (
                            <>
                              <span className="notes-folder-count">{count}</span>
                              <ChevronRight size={16} className="notes-chevron" />
                            </>
                          )}
                        </button>
                        {editingFolders && (
                          <div className="notes-folder-edit-actions">
                            <button
                              type="button"
                              className="notes-folder-rename-btn"
                              aria-label={`Rename folder ${proj}`}
                              title={`Rename ${proj}`}
                              onClick={() => startRenamingFolder(proj, 'list')}
                            >
                              <Pencil size={14} />
                            </button>
                            {state.projects.length > 1 && (
                              <button
                                type="button"
                                className="notes-folder-delete"
                                aria-label={`Delete folder ${proj}`}
                                title={`Delete ${proj}`}
                                onClick={() => {
                                  const remaining = state.projects.filter((p) => p !== proj);
                                  actions.removeProject(proj);
                                  if (selectedFolder === proj) {
                                    setSelectedFolder(remaining[0] || '__BOTTLENECKS__');
                                  }
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="notes-section-label">Archive</div>
            <div className="notes-group-card is-archive-door-card">
              <button
                type="button"
                className="notes-folder-row"
                onClick={enterArchiveMode}
              >
                <span className="notes-folder-icon is-archive-door">
                  <Archive size={16} />
                </span>
                <span className="notes-folder-name">Archive</span>
                <span className="notes-folder-count">{archivedNotes.length}</span>
                <ChevronRight size={16} className="notes-chevron" />
              </button>
            </div>
          </>
        )}
      </aside>

      {/* PANE 2: Notes List inside Selected Folder */}
      <section className="notes-list-pane" aria-label={folderDisplayName}>
        <div className="notes-list-topbar">
          <button
            type="button"
            className="notes-back-btn notes-mobile-only"
            onClick={() => {
              setReordering(false);
              setDragState(null);
              setMobilePane('folders');
            }}
          >
            <ChevronLeft size={19} />
            <span>{isArchiveFolder ? 'Archive' : 'Folders'}</span>
          </button>
          <div className="ops-row" style={{ gap: 2, marginLeft: 'auto' }}>
            {canReorder && folderNotes.length > 1 && (
              <button
                type="button"
                className="notes-text-btn"
                onClick={() => {
                  setDragState(null);
                  setReordering((prev) => !prev);
                }}
              >
                {reordering ? 'Done' : 'Prioritize'}
              </button>
            )}
            {!reordering && !isArchiveFolder && (
              <button
                type="button"
                className="notes-icon-btn"
                aria-label="Compose new note"
                title="New Note"
                onClick={createNewNote}
              >
                <SquarePen size={19} />
              </button>
            )}
          </div>
        </div>

        <div className="notes-folder-heading-row">
          {!isArchiveFolder &&
          selectedFolder !== '__BOTTLENECKS__' &&
          renamingFolder === selectedFolder &&
          renamingContext === 'heading' ? (
            <form className="notes-heading-rename-form" onSubmit={commitRenameFolder}>
              <input
                ref={renameFolderInputRef}
                type="text"
                className="notes-heading-rename-input"
                aria-label="Edit folder name"
                value={renameFolderDraft}
                onChange={(e) => setRenameFolderDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelRenamingFolder();
                  }
                }}
              />
              <button
                type="submit"
                className="notes-icon-btn is-confirm"
                aria-label="Save folder name"
              >
                <Check size={15} />
              </button>
              <button
                type="button"
                className="notes-icon-btn"
                aria-label="Cancel rename"
                onClick={cancelRenamingFolder}
              >
                <X size={15} />
              </button>
            </form>
          ) : (
            <>
              <h2 className="notes-folder-heading">{folderDisplayName}</h2>
              {!isArchiveFolder && selectedFolder !== '__BOTTLENECKS__' && (
                <button
                  type="button"
                  className="notes-heading-rename-btn"
                  aria-label={`Rename folder ${folderDisplayName}`}
                  title="Rename folder"
                  onClick={() => startRenamingFolder(selectedFolder, 'heading')}
                >
                  <Pencil size={14} />
                </button>
              )}
            </>
          )}
          {isArchiveFolder && <span className="notes-archive-mode-pill">Archive</span>}
          {isArchiveFolder && (() => {
            const folderEarnedTotal = folderNotes.reduce(
              (sum, n) =>
                sum + (typeof n.earnedAmountDollars === 'number' ? n.earnedAmountDollars : 0),
              0
            );
            if (folderEarnedTotal <= 0) return null;
            const formatted =
              folderEarnedTotal % 1 === 0
                ? folderEarnedTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })
                : folderEarnedTotal.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  });
            return <span className="notes-archive-earned-pill">${formatted} made</span>;
          })()}
        </div>

        {reordering ? (
          <div className="notes-reorder-hint">
            Drag <GripVertical size={13} /> to set priority — top is most important.
          </div>
        ) : (
          <div className="notes-search-pill">
            <Search size={15} />
            <input
              type="search"
              className="notes-search-input"
              placeholder={isArchiveFolder ? `Search ${folderDisplayName} archive` : 'Search'}
              aria-label="Search notes"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="notes-search-clear"
                aria-label="Clear search"
                onClick={() => setSearchQuery('')}
              >
                <X size={13} />
              </button>
            )}
          </div>
        )}

        {isArchiveFolder && (
          <div className="notes-archive-filter-row" role="tablist" aria-label="Filter archive by completion">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'completed', label: 'Complete' },
                { id: 'not-completed', label: 'Not Complete' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`notes-filter-chip ${
                  archiveOutcomeFilter === opt.id ? 'is-active' : ''
                }`.trim()}
                onClick={() => setArchiveOutcomeFilter(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {folderNotes.length === 0 ? (
          <div className="notes-empty-list">
            <span>
              {searchQuery
                ? 'No matching notes'
                : isArchiveFolder
                ? `No archived ideas in ${folderDisplayName} yet.`
                : `No notes in ${folderDisplayName} yet.`}
            </span>
            {!searchQuery && !isArchiveFolder && (
              <button type="button" className="notes-primary-pill" onClick={createNewNote}>
                <SquarePen size={14} />
                <span>New Note</span>
              </button>
            )}
          </div>
        ) : (
          <div
            className={`notes-group-card notes-items-card ${dragState ? 'is-dragging' : ''}`.trim()}
          >
            {folderNotes.map((item, idx) => {
              const isSelected = activeNote?.id === item.id;
              const scheduled = state.blocks.find(
                (b) => b.assignedIdeaId === item.id && !b.completed
              );
              const blocker = isArchiveFolder ? undefined : blockedByMap.get(item.id);
              const covering = !isArchiveFolder && item.isBottleneck && item.blocksBelow;
              const isDragged = dragState?.id === item.id;
              const shift = rowShiftFor(idx, item.id);
              const effOutcome: ArchiveOutcome = item.archivedOutcome ?? 'completed';

              const rowContent = (
                <>
                  <div className="notes-item-top">
                    {reordering && <span className="notes-rank-num">{idx + 1}</span>}
                    <span className="notes-item-title">
                      {item.title.trim() || 'New Note'}
                    </span>
                    {isArchiveFolder && (
                      <span
                        className={`notes-mini-badge ${
                          effOutcome === 'completed'
                            ? 'is-outcome-complete'
                            : 'is-outcome-incomplete'
                        }`.trim()}
                      >
                        {effOutcome === 'completed' ? (
                          <>
                            <Check size={10} strokeWidth={3} /> Complete
                          </>
                        ) : (
                          'Not Complete'
                        )}
                      </span>
                    )}
                    {blocker && (
                      <span className="notes-mini-badge is-blocked">
                        <Lock size={10} /> Blocked
                      </span>
                    )}
                    {covering && (
                      <span className="notes-mini-badge is-covering">
                        <Layers size={10} /> Covers below
                      </span>
                    )}
                    {!covering && item.isBottleneck && (
                      <span className="notes-mini-badge is-bottleneck">Bottleneck</span>
                    )}
                    {!reordering && item.responsibilityType && (
                      <span className={`notes-mini-badge is-${item.responsibilityType}`}>
                        {responsibilityLabel(
                          item.responsibilityType,
                          isArchiveFolder ? item.earnedAmountDollars : undefined
                        )}
                      </span>
                    )}
                    {!reordering && !isArchiveFolder && scheduled && (
                      <span className="notes-mini-badge is-scheduled">
                        {scheduled.date === todayIso
                          ? 'Today'
                          : formatShortDate(scheduled.date)}
                      </span>
                    )}
                  </div>
                  <div className="notes-item-sub">
                    {selectedFolder === '__BOTTLENECKS__' ? (
                      <span className="notes-item-folder-prefix">{item.project} · </span>
                    ) : null}
                    <span>{getPreviewSnippet(item)}</span>
                  </div>
                </>
              );

              const rowClass = `notes-item-row ${isSelected && !reordering ? 'is-selected' : ''} ${
                blocker ? 'is-blocked' : ''
              } ${covering ? 'is-covering' : ''} ${isDragged ? 'is-dragged' : ''}`
                .replace(/\s+/g, ' ')
                .trim();

              return (
                <div
                  key={item.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(item.id, el);
                    else rowRefs.current.delete(item.id);
                  }}
                  className={`notes-item-slot ${reordering ? 'is-reordering' : ''}`.trim()}
                  style={
                    dragState
                      ? {
                          transform: `translate3d(0, ${shift}px, 0)`,
                          transition: isDragged ? 'none' : 'transform 160ms ease',
                          zIndex: isDragged ? 5 : 1,
                        }
                      : undefined
                  }
                >
                  {reordering ? (
                    <div className={rowClass}>
                      <div className="notes-item-main">{rowContent}</div>
                      <span
                        className="notes-grip"
                        role="button"
                        aria-label={`Drag to reprioritize ${item.title || 'note'}`}
                        onPointerDown={(e) => onGripPointerDown(e, item.id, idx)}
                        onPointerMove={onGripPointerMove}
                        onPointerUp={onGripPointerUp}
                        onPointerCancel={onGripPointerUp}
                      >
                        <GripVertical size={18} />
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={rowClass}
                      onClick={() => openNote(item.id)}
                    >
                      <div className="notes-item-main">{rowContent}</div>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* PANE 3: Freeform Apple Note Editor */}
      <div className="notes-detail-desktop">
        {renderNoteEditor(activeNote, false)}
      </div>

      {mobilePane === 'note' && (
        <div className="notes-detail-mobile">
          {renderNoteEditor(openNoteRecord ?? activeNote, true)}
        </div>
      )}
    </div>
  );
};
