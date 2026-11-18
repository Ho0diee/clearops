import React, { useState } from 'react';
import { AlertTriangle, FolderPlus, Plus } from 'lucide-react';
import { Button, SelectField, TextField, TogglePill } from '../../components/ui';
import { useOpsStore } from '../../store/opsStore';

interface QuickCaptureBarProps {
  selectedProjectFilter: string;
  onProjectCreated?: (projectName: string) => void;
}

export const QuickCaptureBar: React.FC<QuickCaptureBarProps> = ({
  selectedProjectFilter,
  onProjectCreated,
}) => {
  const { state, actions } = useOpsStore();

  const defaultProject =
    selectedProjectFilter !== 'ALL' && state.projects.includes(selectedProjectFilter)
      ? selectedProjectFilter
      : state.projects[0] || 'OHCR';

  const [title, setTitle] = useState('');
  const [startingStep, setStartingStep] = useState('');
  const [project, setProject] = useState(defaultProject);
  const [isBottleneck, setIsBottleneck] = useState(false);
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');

  const activeProjectValue = state.projects.includes(project) ? project : defaultProject;

  const handleCaptureSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      actions.showToast('Enter an idea or bottleneck title first');
      return;
    }

    actions.addIdea({
      project: activeProjectValue,
      title: cleanTitle,
      startingStep:
        startingStep.trim() || `Draft 15-minute opening scope for ${cleanTitle}`,
      isBottleneck,
      estimatedMinutes: 45,
    });

    setTitle('');
    setStartingStep('');
    setIsBottleneck(false);
  };

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newProjectName.trim();
    if (!clean) return;
    actions.addProject(clean);
    setProject(clean);
    setNewProjectName('');
    setIsAddingProject(false);
    onProjectCreated?.(clean);
    actions.showToast(`Added project "${clean}"`);
  };

  return (
    <div className="ops-stack-sm">
      <form className="ui-capture-bar" onSubmit={handleCaptureSubmit}>
        <input
          type="text"
          className="ui-capture-input-bare"
          placeholder="New idea or bottleneck..."
          aria-label="New idea or bottleneck title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <span className="ui-capture-divider" aria-hidden="true" />

        <input
          type="text"
          className="ui-capture-input-bare"
          placeholder="Starting step: Draft 1-page scope..."
          aria-label="Concrete starting step"
          value={startingStep}
          onChange={(e) => setStartingStep(e.target.value)}
        />

        <span className="ui-capture-divider" aria-hidden="true" />

        <div className="ops-row-wrap" style={{ justifyContent: 'space-between' }}>
          <div style={{ flex: '1 1 120px', minWidth: 0 }}>
            <SelectField
              aria-label="Select project"
              value={activeProjectValue}
              onChange={(e) => {
                if (e.target.value === '__NEW_PROJECT__') {
                  setIsAddingProject(true);
                } else {
                  setProject(e.target.value);
                }
              }}
            >
              {state.projects.map((proj) => (
                <option key={proj} value={proj}>
                  {proj}
                </option>
              ))}
              <option value="__NEW_PROJECT__">+ New Project...</option>
            </SelectField>
          </div>

          <TogglePill
            active={isBottleneck}
            onToggle={() => setIsBottleneck((prev) => !prev)}
            label="Bottleneck"
            title="Flag this item as an active bottleneck"
          />

          <Button
            type="submit"
            variant="primary"
            size="md"
            style={{ flex: '1 0 92px' }}
            iconLeft={<Plus size={16} />}
          >
            Add
          </Button>
        </div>
      </form>

      {isAddingProject && (
        <form className="ui-card-subtle ui-list-row" onSubmit={handleCreateProject}>
          <div className="ops-row-wrap" style={{ flex: 1, minWidth: 0 }}>
            <AlertTriangle size={14} />
            <span className="ui-section-meta">New Project Bucket:</span>
            <div style={{ flex: '1 1 180px', maxWidth: '260px', minWidth: 0 }}>
              <TextField
                placeholder="e.g., RealEstate, Lab, Consulting..."
                aria-label="New project name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <div className="ops-row-wrap" style={{ justifyContent: 'flex-end' }}>
            <Button type="submit" variant="primary" size="sm">
              Create Project
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsAddingProject(false);
                setNewProjectName('');
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
};
