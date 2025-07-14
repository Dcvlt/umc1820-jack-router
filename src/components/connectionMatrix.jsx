import React, { useState, useMemo, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { Box, Button, Typography, Paper, IconButton } from '@mui/material';

export const ConnectionMatrix = ({
  deviceConfig,
  showIndividualChannels,
  stereoGroups,
  isUpdating,
  theme,
  onToggleChannelView,
  onToggleConnection,
  isConnectionActive,
}) => {
  if (!deviceConfig) return null;

  const [expandedGroups, setExpandedGroups] = useState({});
  const [processedInputs, setProcessedInputs] = useState({});
  const [processedOutputs, setProcessedOutputs] = useState({});

  console.log('Stereo Groups:', stereoGroups);
  console.log('expandedGroups:', expandedGroups);
  console.log('Processed Inputs:', processedInputs);
  console.log('Processed Outputs:', processedOutputs);

  // Calculate total columns needed
  const totalInputColumns = useMemo(() => {
    return Object.values(processedInputs).reduce(
      (sum, group) => sum + group.displayItems.length,
      0
    );
  }, [processedInputs]);

  // Calculate total rows needed
  const totalOutputRows = useMemo(() => {
    return Object.values(processedOutputs).reduce(
      (sum, group) => sum + group.displayItems.length,
      0
    );
  }, [processedOutputs]);

  const toggleGroupExpansion = (groupKey) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupKey]: !prev[groupKey],
    }));
  };

  // Helper function to determine if a group should be expandable
  const isExpandableGroup = (groupKey, members) => {
    return groupKey !== 'default' && members.length > 1;
  };

  // Helper function to check if any member of a group is connected to any member of another group
  const isGroupConnected = (sourceMembers, targetMembers) => {
    return sourceMembers.some((source) =>
      targetMembers.some((target) => isConnectionActive(source.key, target.key))
    );
  };

  // Helper function to handle group-to-group connections
  const handleGroupConnection = (sourceItem, targetItem) => {
    if (sourceItem.isGroup && targetItem.isGroup) {
      // Group to group - connect all members
      const isCurrentlyConnected = isGroupConnected(
        sourceItem.members,
        targetItem.members
      );
      sourceItem.members.forEach((source) => {
        targetItem.members.forEach((target) => {
          if (
            isConnectionActive(source.key, target.key) === isCurrentlyConnected
          ) {
            onToggleConnection(source.key, target.key);
          }
        });
      });
    } else if (sourceItem.isGroup && !targetItem.isGroup) {
      // Group to individual - connect all group members to the individual
      const isCurrentlyConnected = sourceItem.members.some((source) =>
        isConnectionActive(source.key, targetItem.key)
      );
      sourceItem.members.forEach((source) => {
        if (
          isConnectionActive(source.key, targetItem.key) ===
          isCurrentlyConnected
        ) {
          onToggleConnection(source.key, targetItem.key);
        }
      });
    } else if (!sourceItem.isGroup && targetItem.isGroup) {
      // Individual to group - connect individual to all group members
      const isCurrentlyConnected = targetItem.members.some((target) =>
        isConnectionActive(sourceItem.key, target.key)
      );
      targetItem.members.forEach((target) => {
        if (
          isConnectionActive(sourceItem.key, target.key) ===
          isCurrentlyConnected
        ) {
          onToggleConnection(sourceItem.key, target.key);
        }
      });
    } else {
      // Individual to individual - normal connection
      onToggleConnection(sourceItem.key, targetItem.key);
    }
  };

  // Update processed inputs when dependencies change
  useEffect(() => {
    if (!deviceConfig?.inputs) {
      setProcessedInputs({});
      return;
    }

    const newProcessedInputs = Object.entries(
      Object.entries(deviceConfig.inputs).reduce((acc, [key, input]) => {
        const group = input.group || 'default';
        if (!acc[group]) acc[group] = [];
        acc[group].push({ key, ...input });
        return acc;
      }, {})
    ).reduce((acc, [groupKey, members]) => {
      const isExpanded = expandedGroups[groupKey];
      const isExpandable = isExpandableGroup(groupKey, members);

      let displayItems = [];

      if (groupKey === 'default' || (isExpandable && isExpanded)) {
        // Show individual members
        displayItems = members.map((member) => ({
          ...member,
          isGroup: false,
          displayLabel: member.label,
        }));
      } else if (isExpandable && !isExpanded) {
        // Show as grouped item
        displayItems = [
          {
            key: groupKey,
            isGroup: true,
            members: members,
            displayLabel: `${groupKey} (${members.length})`,
            groupKey: groupKey,
          },
        ];
      } else {
        // Single item, show as individual
        displayItems = members.map((member) => ({
          ...member,
          isGroup: false,
          displayLabel: member.label,
        }));
      }

      acc[groupKey] = {
        groupLabel: groupKey,
        members: members,
        displayItems: displayItems,
        isExpandable: isExpandable,
        isExpanded: isExpanded,
      };

      return acc;
    }, {});

    setProcessedInputs(newProcessedInputs);
  }, [deviceConfig?.inputs, expandedGroups]);

  // Update processed outputs when dependencies change
  useEffect(() => {
    if (!deviceConfig?.outputs) {
      setProcessedOutputs({});
      return;
    }

    const newProcessedOutputs = Object.entries(
      Object.entries(deviceConfig.outputs).reduce((acc, [key, output]) => {
        const group = output.group || 'default';
        if (!acc[group]) acc[group] = [];
        acc[group].push({ key, ...output });
        return acc;
      }, {})
    ).reduce((acc, [groupKey, members]) => {
      const isExpanded = expandedGroups[groupKey];
      const isExpandable = isExpandableGroup(groupKey, members);

      let displayItems = [];

      if (groupKey === 'default' || (isExpandable && isExpanded)) {
        // Show individual members
        displayItems = members.map((member) => ({
          ...member,
          isGroup: false,
          displayLabel: member.label,
        }));
      } else if (isExpandable && !isExpanded) {
        // Show as grouped item
        displayItems = [
          {
            key: groupKey,
            isGroup: true,
            members: members,
            displayLabel: `${groupKey} (${members.length})`,
            groupKey: groupKey,
          },
        ];
      } else {
        // Single item, show as individual
        displayItems = members.map((member) => ({
          ...member,
          isGroup: false,
          displayLabel: member.label,
        }));
      }

      acc[groupKey] = {
        groupLabel: groupKey,
        members: members,
        displayItems: displayItems,
        isExpandable: isExpandable,
        isExpanded: isExpanded,
      };

      return acc;
    }, {});

    setProcessedOutputs(newProcessedOutputs);
  }, [deviceConfig?.outputs, expandedGroups]);

  const gridStyles = {
    container: {
      position: 'relative',
      backgroundColor: theme.gridBg || '#f5f5f5',
      padding: 2,
      borderRadius: 2,
      overflow: 'auto',
      display: 'grid',
      gridTemplateColumns: `120px repeat(${totalInputColumns}, 120px)`,
      gridTemplateRows: `100px repeat(${totalOutputRows}, 100px)`,
      gap: 1,
      '&::before': {
        content: '""',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: `
          linear-gradient(to right, ${theme.gridLine || '#e0e0e0'} 1px, transparent 1px),
          linear-gradient(to bottom, ${theme.gridLine || '#e0e0e0'} 1px, transparent 1px)
        `,
        backgroundSize: '127.55px 106.9px',
        backgroundPosition: '204px 70px',
        opacity: 0.3,
        pointerEvents: 'none',
        zIndex: 0,
      },
    },
    header: {
      position: 'relative',
      zIndex: 1,
      padding: 1,
      backgroundColor: theme.headerBg || '#1976d2',
      color: theme.headerText || 'white',
      textAlign: 'center',
      fontWeight: 'bold',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 1,
      boxShadow: 2,
    },
    groupHeader: {
      backgroundColor: theme.groupHeaderBg || '#2196f3',
      border: `2px solid ${theme.groupBorder || '#1976d2'}`,
    },
    connectionNode: {
      position: 'relative',
      zIndex: 1,
      width: '40px',
      height: '40px',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: theme.nodeText || 'white',
      cursor: isUpdating ? 'not-allowed' : 'pointer',
      transition: 'all 0.3s ease',
      border: '2px solid',
      fontWeight: 'bold',
      fontSize: '16px',
      margin: 'auto',
      '&:hover': {
        transform: isUpdating ? 'none' : 'scale(1.1)',
        boxShadow: 4,
      },
    },
    groupConnectionNode: {
      borderRadius: '20%',
      width: '45px',
      height: '45px',
      fontSize: '18px',
      fontWeight: 'bold',
    },
    expandButton: {
      minWidth: '20px',
      width: '20px',
      height: '20px',
      padding: 0,
      fontSize: '12px',
      marginLeft: '4px',
    },
  };

  return (
    <Box sx={{ width: '100%', marginTop: 2 }}>
      <Box
        sx={{
          marginBottom: 2,
          display: 'flex',
          gap: 2,
          alignItems: 'center',
        }}
      >
        <Button
          onClick={onToggleChannelView}
          variant="contained"
          color="primary"
          startIcon={<Settings size={14} />}
        >
          {showIndividualChannels
            ? 'Show Stereo Groups'
            : 'Show Individual Channels'}
        </Button>
        {Object.keys(stereoGroups || {}).length > 0 && (
          <Typography variant="body2" color="textSecondary">
            {Object.keys(stereoGroups || {}).length} stereo groups detected
          </Typography>
        )}
      </Box>

      <Box sx={gridStyles.container}>
        {/* Top-left corner cell */}
        <Paper sx={{ ...gridStyles.header, gridColumn: '1', gridRow: '1' }}>
          <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
            Outputs ↓
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
            Inputs →
          </Typography>
        </Paper>

        {/* Header Row - Input labels */}
        {Object.values(processedInputs).map(
          ({ groupLabel, displayItems, isExpandable, isExpanded }) =>
            displayItems.map((input, inputIndex) => {
              // Calculate column position for inputs
              const colIndex =
                Object.values(processedInputs)
                  .slice(
                    0,
                    Object.values(processedInputs).findIndex(
                      (group) => group.groupLabel === groupLabel
                    )
                  )
                  .reduce((sum, group) => sum + group.displayItems.length, 0) +
                inputIndex +
                2;

              return (
                <Paper
                  key={input.key}
                  sx={{
                    ...gridStyles.header,
                    ...(input.isGroup ? gridStyles.groupHeader : {}),
                    fontSize: input.isGroup ? '0.75rem' : '0.8rem',
                    gridColumn: `${colIndex}`,
                    gridRow: '1',
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: 'bold',
                      textAlign: 'center',
                      lineHeight: 1.2,
                    }}
                  >
                    {input.displayLabel}
                  </Typography>
                  {isExpandable && !showIndividualChannels && (
                    <IconButton
                      size="small"
                      onClick={() =>
                        toggleGroupExpansion(
                          input.isGroup ? input.groupKey : groupLabel
                        )
                      }
                      sx={{
                        ...gridStyles.expandButton,
                        color: theme.headerText || 'white',
                      }}
                    >
                      {isExpanded ? (
                        <>
                          <br />
                          <Typography sx={{ fontSize: 14 }}>⮅</Typography>
                        </>
                      ) : (
                        <>
                          <br />
                          <Typography sx={{ fontSize: 14 }}>⮀</Typography>
                        </>
                      )}
                    </IconButton>
                  )}
                </Paper>
              );
            })
        )}

        {/* Matrix Body - Output labels and connection nodes */}
        {Object.values(processedOutputs).map(
          (
            { groupLabel, displayItems, isExpandable, isExpanded },
            outputGroupIndex
          ) =>
            displayItems.map((output, outputIndex) => {
              // Calculate row position
              const rowIndex =
                Object.values(processedOutputs)
                  .slice(0, outputGroupIndex)
                  .reduce((sum, group) => sum + group.displayItems.length, 0) +
                outputIndex +
                2;

              return (
                <React.Fragment key={output.key}>
                  {/* Output label */}
                  <Paper
                    sx={{
                      ...gridStyles.header,
                      ...(output.isGroup ? gridStyles.groupHeader : {}),
                      fontSize: output.isGroup ? '0.75rem' : '0.8rem',
                      flexDirection: 'row',
                      gap: 1,
                      gridColumn: '1',
                      gridRow: `${rowIndex}`,
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 'bold',
                        textAlign: 'center',
                        lineHeight: 1.2,
                        flex: 1,
                      }}
                    >
                      {output.displayLabel}
                    </Typography>
                    {isExpandable && !showIndividualChannels && (
                      <IconButton
                        size="small"
                        onClick={() =>
                          toggleGroupExpansion(
                            output.isGroup ? output.groupKey : groupLabel
                          )
                        }
                        sx={{
                          ...gridStyles.expandButton,
                          color: theme.headerText || 'white',
                        }}
                      >
                        {isExpanded ? (
                          <Typography sx={{ fontSize: 14 }}>⮅</Typography>
                        ) : (
                          <Typography sx={{ fontSize: 14 }}>⮀</Typography>
                        )}
                      </IconButton>
                    )}
                  </Paper>

                  {/* Connection nodes for this output */}
                  {Object.values(processedInputs).map(
                    (
                      {
                        groupLabel: inputGroupLabel,
                        displayItems: inputDisplayItems,
                      },
                      inputGroupIndex
                    ) =>
                      inputDisplayItems.map((input, inputIndex) => {
                        // Calculate column position
                        const colIndex =
                          Object.values(processedInputs)
                            .slice(0, inputGroupIndex)
                            .reduce(
                              (sum, group) => sum + group.displayItems.length,
                              0
                            ) +
                          inputIndex +
                          2;

                        // Determine if connection is active
                        let isActive = false;
                        if (input.isGroup && output.isGroup) {
                          isActive = isGroupConnected(
                            input.members,
                            output.members
                          );
                        } else if (input.isGroup && !output.isGroup) {
                          isActive = input.members.some((member) =>
                            isConnectionActive(member.key, output.key)
                          );
                        } else if (!input.isGroup && output.isGroup) {
                          isActive = output.members.some((member) =>
                            isConnectionActive(input.key, member.key)
                          );
                        } else {
                          isActive = isConnectionActive(input.key, output.key);
                        }

                        // Check if EITHER input or output is a group (not both individual)
                        const isGroupConnection =
                          input.isGroup || output.isGroup;

                        return (
                          <Box
                            key={`${input.key}-${output.key}`}
                            sx={{
                              ...gridStyles.connectionNode,
                              ...(isGroupConnection
                                ? gridStyles.groupConnectionNode
                                : {}),
                              backgroundColor: isActive
                                ? theme.buttonActive || '#4caf50'
                                : theme.buttonInactive || '#757575',
                              borderColor: isActive
                                ? theme.buttonActiveBorder || '#4caf50'
                                : theme.buttonInactive || '#757575',
                              color: 'white',
                              boxShadow: isActive
                                ? `0 0 15px ${theme.buttonActive || '#4caf50'}50`
                                : 2,
                              opacity: isUpdating ? 0.5 : 1,
                              gridColumn: `${colIndex}`,
                              gridRow: `${rowIndex}`,
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              if (!isUpdating) {
                                handleGroupConnection(input, output);
                              }
                            }}
                          >
                            {isGroupConnection
                              ? isActive
                                ? '⯌'
                                : '⯎'
                              : isActive
                                ? '●'
                                : '○'}
                          </Box>
                        );
                      })
                  )}
                </React.Fragment>
              );
            })
        )}
      </Box>
    </Box>
  );
};
