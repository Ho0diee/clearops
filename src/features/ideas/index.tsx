import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderPlus,
  Lightbulb,
  Search,
  SquarePen,
  Trash2,
  X,
} from 'lucide-react';
import { formatShortDate, useOpsStore } from '../../store/opsStore';
import { formatFriendlyTime } from '../../store/scheduleAi';
import type { CalendarBlock, IdeaItem } from '../../types/schema';

type SmartFolderId = '__ALL__' | '__BOTTLENECKS__' | string;
type MobileNotesPane = 'folders' | 'list' | 'note';

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
  const { state, actions } = useOpsStore();

  const [selectedFolder, setSelectedFolder] = useState<SmartFolderId>('__ALL__');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<MobileNotesPane>('folders');

  const [searchQuery, setSearchQuery] = useState('');
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolders, setEditingFolders] = useState(false);
  const [zonePickerOpen, setZonePickerOpen] = useState(false);

  const titleInputRef = useRef<HTMLTextAreaElement | null>(null);
  const bodyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const newFolderInputRef = useRef<HTMLInputElement | null>(null);
  const pendingCursorRef = useRef<number | null>(null);

  const allNotes = useMemo(
    () => state.ideas.filter((i) => i.status !== 'completed'),
    [state.ideas]
  );

  const bottleneckCount = useMemo(
    () => allNotes.filter((i) => i.isBottleneck).length,
    [allNotes]
  );

  const folderNotes = useMemo(() => {
    let base = allNotes;
    if (selectedFolder === '__BOTTLENECKS__') {
      base = allNotes.filter((i) => i.isBottleneck);
    } else if (selectedFolder !== '__ALL__') {
      base = allNotes.filter((i) => i.project === selectedFolder);
    }

    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter((i) => {
      const hay = `${i.title} ${getNoteBody(i)} ${i.project}`.toLowerCase();
      return hay.includes(q);
    });
  }, [allNotes, selectedFolder, searchQuery]);

  const activeNote = useMemo(
    () => allNotes.find((n) => n.id === selectedNoteId) ?? folderNotes[0] ?? null,
    [allNotes, folderNotes, selectedNoteId]
  );

  const openNoteRecord = useMemo(
    () => (selectedNoteId ? allNotes.find((n) => n.id === selectedNoteId) ?? null : null),
    [allNotes, selectedNoteId]
  );

  // Open Empty Zones available on the calendar (today & upcoming)
  const openEmptyZones = useMemo(
    () =>
      state.blocks
        .filter((b) => isOpenEmptyZone(b) && b.date >= '2026-11-17')
        .sort((a, b) =>
          a.date !== b.date ? a.date.localeCompare(b.date) : a.startTime.localeCompare(b.startTime)
        ),
    [state.blocks]
  );

  const folderDisplayName =
    selectedFolder === '__ALL__'
      ? 'All Ideas'
      : selectedFolder === '__BOTTLENECKS__'
      ? 'Bottlenecks'
      : selectedFolder;

  // Cleanup blank untitled note when navigating away (Apple Notes behavior)
  const cleanupBlankNoteIfEmpty = (noteId: string | null) => {
    if (!noteId) return;
    const item = state.ideas.find((i) => i.id === noteId);
    if (item && !item.title.trim() && !getNoteBody(item).trim()) {
      actions.deleteIdea(item.id);
    }
  };

  const openFolder = (folderId: SmartFolderId) => {
    cleanupBlankNoteIfEmpty(selectedNoteId);
    setSelectedFolder(folderId);
    setSearchQuery('');
    setZonePickerOpen(false);
    setMobilePane('list');
    const firstInFolder =
      folderId === '__ALL__'
        ? allNotes[0]
        : folderId === '__BOTTLENECKS__'
        ? allNotes.find((i) => i.isBottleneck)
        : allNotes.find((i) => i.project === folderId);
    setSelectedNoteId(firstInFolder?.id ?? null);
  };

  const openNote = (noteId: string) => {
    if (selectedNoteId && selectedNoteId !== noteId) {
      cleanupBlankNoteIfEmpty(selectedNoteId);
    }
    setSelectedNoteId(noteId);
    setZonePickerOpen(false);
    setMobilePane('note');
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
          <Lightbulb size={28} strokeWidth={1.6} />
          <span>Select a note or tap Compose to start writing</span>
          <button type="button" className="notes-primary-pill" onClick={createNewNote}>
            <SquarePen size={15} />
            <span>New Note</span>
          </button>
        </div>
      );
    }

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
            <button
              type="button"
              className="notes-icon-btn is-danger"
              aria-label="Delete note"
              title="Delete note"
              onClick={() => {
                const deletedId = note.id;
                actions.deleteIdea(deletedId);
                setZonePickerOpen(false);
                if (isMobileEditor) {
                  setMobilePane('list');
                }
                setSelectedNoteId(null);
              }}
            >
              <Trash2 size={17} />
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
          </div>
        </div>

        {/* Pure Apple Notes Paper Canvas */}
        <div className="notes-paper">
          {/* Lightweight Pill Strip: Idea/Bottleneck · Empty Zone */}
          <div className="notes-chip-row">
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
                      scheduledBlock.date === '2026-11-17'
                        ? 'Today'
                        : formatShortDate(scheduledBlock.date)
                    } · ${formatFriendlyTime(scheduledBlock.startTime)}`
                  : 'Empty Zone'}
              </span>
            </button>
          </div>

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
                      {z.date === '2026-11-17' ? 'Today' : formatShortDate(z.date)}
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
                    actions.assignIdeaToNextEmptyZone(note.id);
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
    <div className={`notes-shell is-pane-${mobilePane}`.trim()}>
      {/* PANE 1: Folders (Apple Notes root screen on mobile, left sidebar on desktop) */}
      <aside className="notes-folders-pane" aria-label="Folders">
        <div className="notes-pane-topbar">
          <h1 className="notes-large-title">Folders</h1>
          {state.projects.length > 1 && (
            <button
              type="button"
              className="notes-text-btn"
              onClick={() => setEditingFolders((prev) => !prev)}
            >
              {editingFolders ? 'Done' : 'Edit'}
            </button>
          )}
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
            <button type="submit" className="notes-icon-btn is-confirm" aria-label="Create folder">
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
            className={`notes-folder-row ${selectedFolder === '__ALL__' ? 'is-selected' : ''}`.trim()}
            onClick={() => openFolder('__ALL__')}
          >
            <span className="notes-folder-icon">
              <Folder size={17} />
            </span>
            <span className="notes-folder-name">All Ideas</span>
            <span className="notes-folder-count">{allNotes.length}</span>
            <ChevronRight size={16} className="notes-chevron" />
          </button>

          <button
            type="button"
            className={`notes-folder-row ${
              selectedFolder === '__BOTTLENECKS__' ? 'is-selected' : ''
            }`.trim()}
            onClick={() => openFolder('__BOTTLENECKS__')}
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
                  onClick={() => openFolder(proj)}
                >
                  <span className="notes-folder-icon">
                    <Folder size={17} />
                  </span>
                  <span className="notes-folder-name">{proj}</span>
                  <span className="notes-folder-count">{count}</span>
                  <ChevronRight size={16} className="notes-chevron" />
                </button>
                {editingFolders && state.projects.length > 1 && (
                  <button
                    type="button"
                    className="notes-folder-delete"
                    aria-label={`Delete folder ${proj}`}
                    onClick={() => {
                      actions.removeProject(proj);
                      if (selectedFolder === proj) {
                        setSelectedFolder('__ALL__');
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="notes-folders-footer">
          <button
            type="button"
            className="notes-new-folder-trigger"
            onClick={() => setAddingFolder(true)}
          >
            <FolderPlus size={18} />
            <span>New Folder</span>
          </button>
          <span className="notes-footer-meta">
            {allNotes.length} {allNotes.length === 1 ? 'Note' : 'Notes'}
          </span>
          <button
            type="button"
            className="notes-compose-fab"
            aria-label="New note"
            title="New Note"
            onClick={createNewNote}
          >
            <SquarePen size={19} />
          </button>
        </div>
      </aside>

      {/* PANE 2: Notes List inside Selected Folder */}
      <section className="notes-list-pane" aria-label={folderDisplayName}>
        <div className="notes-list-topbar">
          <button
            type="button"
            className="notes-back-btn notes-mobile-only"
            onClick={() => setMobilePane('folders')}
          >
            <ChevronLeft size={19} />
            <span>Folders</span>
          </button>
          <button
            type="button"
            className="notes-icon-btn"
            aria-label="Compose new note"
            title="New Note"
            onClick={createNewNote}
            style={{ marginLeft: 'auto' }}
          >
            <SquarePen size={19} />
          </button>
        </div>

        <h2 className="notes-folder-heading">{folderDisplayName}</h2>

        <div className="notes-search-pill">
          <Search size={15} />
          <input
            type="search"
            className="notes-search-input"
            placeholder="Search"
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

        {folderNotes.length === 0 ? (
          <div className="notes-empty-list">
            <span>
              {searchQuery
                ? 'No matching notes'
                : `No notes in ${folderDisplayName} yet.`}
            </span>
            {!searchQuery && (
              <button type="button" className="notes-primary-pill" onClick={createNewNote}>
                <SquarePen size={14} />
                <span>New Note</span>
              </button>
            )}
          </div>
        ) : (
          <div className="notes-group-card notes-items-card">
            {folderNotes.map((item) => {
              const isSelected = activeNote?.id === item.id;
              const scheduled = state.blocks.find(
                (b) => b.assignedIdeaId === item.id && !b.completed
              );
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`notes-item-row ${isSelected ? 'is-selected' : ''}`.trim()}
                  onClick={() => openNote(item.id)}
                >
                  <div className="notes-item-top">
                    <span className="notes-item-title">
                      {item.title.trim() || 'New Note'}
                    </span>
                    {item.isBottleneck && (
                      <span className="notes-mini-badge is-bottleneck">Bottleneck</span>
                    )}
                    {scheduled && (
                      <span className="notes-mini-badge is-scheduled">
                        {scheduled.date === '2026-11-17'
                          ? 'Today'
                          : formatShortDate(scheduled.date)}
                      </span>
                    )}
                  </div>
                  <div className="notes-item-sub">
                    {selectedFolder === '__ALL__' || selectedFolder === '__BOTTLENECKS__' ? (
                      <span className="notes-item-folder-prefix">{item.project} · </span>
                    ) : null}
                    <span>{getPreviewSnippet(item)}</span>
                  </div>
                </button>
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
