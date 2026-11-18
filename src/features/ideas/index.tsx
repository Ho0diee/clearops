import React, { useState } from 'react';
import { QuickCaptureBar } from './QuickCaptureBar';
import {
  BottleneckFilterMode,
  ProjectRankingColumn,
} from './ProjectRankingColumn';
import { WaitingOnAndCheckupsColumn } from './WaitingOnAndCheckupsColumn';

export const IdeasHubView: React.FC = () => {
  const [selectedProject, setSelectedProject] = useState<string>('ALL');
  const [filterMode, setFilterMode] = useState<BottleneckFilterMode>('all');

  return (
    <div className="ops-stack-lg">
      <QuickCaptureBar
        selectedProjectFilter={selectedProject}
        onProjectCreated={(newProject) => setSelectedProject(newProject)}
      />

      <div className="ops-split-hub">
        <ProjectRankingColumn
          selectedProject={selectedProject}
          onSelectProject={setSelectedProject}
          filterMode={filterMode}
          onSelectFilterMode={setFilterMode}
        />

        <WaitingOnAndCheckupsColumn />
      </div>
    </div>
  );
};
