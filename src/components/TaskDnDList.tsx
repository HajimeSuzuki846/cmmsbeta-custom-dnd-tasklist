import {
    type DragEvent,
    type KeyboardEvent,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
    ReactElement,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState
} from "react";
import classNames from "classnames";
import Big from "big.js";
import { ObjectItem, ValueStatus } from "mendix";
import { CustomDnDTaskListContainerProps } from "../../typings/CustomDnDTaskListProps";
import { runListAction, TaskRowActionIcons } from "./TaskRowActionIcons";
import { SectionInlineTaskAdd } from "./SectionInlineTaskAdd";
import { TaskRowEditableBody, type InlineEditField } from "./TaskRowEditableBody";
import { InlineAddSection } from "./InlineAddSection";

const ORPHAN_SECTION_KEY = "__orphan__";

/** One line per task: object id, tab, 1-based sort index. Microflow: split lines, then split by tab. */
function serializeSortOrderPayload(items: ObjectItem[]): string {
    return items.map((it, i) => `${it.id}\t${i + 1}`).join("\n");
}

function isAvailable<T>(d: { status: ValueStatus; value?: T }): d is { status: ValueStatus.Available; value: T } {
    return d.status === ValueStatus.Available;
}

function compareSortOrder(
    a: ObjectItem,
    b: ObjectItem,
    sortOrderAttribute: CustomDnDTaskListContainerProps["sortOrderAttribute"]
): number {
    const av = sortOrderAttribute.get(a);
    const bv = sortOrderAttribute.get(b);
    const aVal = isAvailable(av) ? av.value : undefined;
    const bVal = isAvailable(bv) ? bv.value : undefined;
    if (aVal == null && bVal == null) {
        return 0;
    }
    if (aVal == null) {
        return 1;
    }
    if (bVal == null) {
        return -1;
    }
    return aVal.cmp(bVal);
}

function isGroupedMode(props: CustomDnDTaskListContainerProps): boolean {
    const { sections, taskSection } = props;
    return (
        sections != null &&
        taskSection != null &&
        sections.status === ValueStatus.Available &&
        (sections.items?.length ?? 0) > 0
    );
}

type TaskGroup = {
    sectionKey: string;
    sectionItem: ObjectItem | null;
    sectionTitle: string;
    tasks: ObjectItem[];
};

function getSectionDisplayTitle(
    section: ObjectItem,
    sectionNameAttribute: CustomDnDTaskListContainerProps["sectionNameAttribute"]
): string {
    const attr = sectionNameAttribute?.get(section);
    if (attr && isAvailable(attr) && attr.value != null && String(attr.value).trim() !== "") {
        return String(attr.value);
    }
    return section.id;
}

function buildTaskGroups(
    props: CustomDnDTaskListContainerProps,
    localTasksBySectionId: Record<string, ObjectItem[]> | undefined
): TaskGroup[] {
    const { sections, tasks, taskSection, sortOrderAttribute, sectionNameAttribute } = props;
    if (!sections || !taskSection) {
        return [];
    }
    const sectionItems = sections.items ?? [];
    const taskItems = tasks.items ?? [];
    const sectionIdSet = new Set(sectionItems.map(s => s.id));

    const tasksBySectionId = new Map<string, ObjectItem[]>();
    for (const t of taskItems) {
        const refDyn = taskSection.get(t);
        let key: string;
        if (!isAvailable(refDyn) || refDyn.value == null) {
            key = ORPHAN_SECTION_KEY;
        } else if (!sectionIdSet.has(refDyn.value.id)) {
            key = ORPHAN_SECTION_KEY;
        } else {
            key = refDyn.value.id;
        }
        if (!tasksBySectionId.has(key)) {
            tasksBySectionId.set(key, []);
        }
        tasksBySectionId.get(key)!.push(t);
    }

    for (const arr of tasksBySectionId.values()) {
        arr.sort((a, b) => compareSortOrder(a, b, sortOrderAttribute));
    }

    const groups: TaskGroup[] = [];
    for (const sec of sectionItems) {
        const sid = sec.id;
        const merged = (localTasksBySectionId && localTasksBySectionId[sid]) ?? tasksBySectionId.get(sid) ?? [];
        groups.push({
            sectionKey: sid,
            sectionItem: sec,
            sectionTitle: getSectionDisplayTitle(sec, sectionNameAttribute),
            tasks: merged
        });
    }

    const orphan =
        (localTasksBySectionId && localTasksBySectionId[ORPHAN_SECTION_KEY]) ??
        tasksBySectionId.get(ORPHAN_SECTION_KEY) ??
        [];
    if (orphan.length > 0) {
        groups.push({
            sectionKey: ORPHAN_SECTION_KEY,
            sectionItem: null,
            sectionTitle: "（セクション未設定・一覧外のタスク）",
            tasks: orphan
        });
    }

    return groups;
}

export function TaskDnDList(props: CustomDnDTaskListContainerProps): ReactElement {
    // Some editor/tsserver setups may lag behind XML→typings regeneration; keep this cast to avoid false-positive diagnostics.
    const typedProps = props as CustomDnDTaskListContainerProps & { onInlineAddSection?: any };

    const {
        name,
        class: className,
        sections,
        sectionNameAttribute,
        tasks,
        taskSection,
        sortOrderAttribute,
        taskNameAttribute,
        taskDescriptionAttribute,
        descriptionMaxLines,
        checkMode,
        taskCheckedAttribute,
        onTaskDetail,
        onTaskDelete,
        onInlineAddTask,
        onInlineAddSection,
        onTaskCheckedCommitted,
        onCheckModeChevron,
        onTaskTitleCommitted,
        onTaskDescriptionCommitted,
        onSectionTitleCommitted,
        onPersistSortOrder,
        onSortOrderChanged
    } = typedProps;

    const widgetReadOnly = (props as { readOnly?: boolean }).readOnly;

    const [draggingId, setDraggingId] = useState<string | undefined>();
    /** dragstart と drop の間で state が追いつかないケースを避ける */
    const draggingIdRef = useRef<string | undefined>(undefined);
    const [localOrder, setLocalOrder] = useState<ObjectItem[] | undefined>();
    const [localTasksBySectionId, setLocalTasksBySectionId] = useState<Record<string, ObjectItem[]> | undefined>();
    const [inlineAddSectionKey, setInlineAddSectionKey] = useState<string | null>(null);
    const [inlineAddDraft, setInlineAddDraft] = useState("");
    const [inlineEditKey, setInlineEditKey] = useState<string | null>(null);
    const [inlineEditDraft, setInlineEditDraft] = useState("");
    const [inlineSectionEditKey, setInlineSectionEditKey] = useState<string | null>(null);
    const [inlineSectionEditDraft, setInlineSectionEditDraft] = useState("");
    const [inlineAddSectionExpanded, setInlineAddSectionExpanded] = useState(false);
    const [inlineAddSectionDraft, setInlineAddSectionDraft] = useState("");

    const widgetRootRef = useRef<HTMLDivElement | null>(null);
    const suppressInputBlurCommitRef = useRef(false);
    const blurSuppressResetTimerRef = useRef<number | undefined>(undefined);
    const sectionTitleInputRef = useRef<HTMLInputElement | null>(null);
    const skipSectionBlurCommitRef = useRef(false);
    const setWidgetRootEl = useCallback((el: HTMLDivElement | null) => {
        widgetRootRef.current = el;
    }, []);

    const grouped = isGroupedMode(props);

    const sortedItems = useMemo(() => {
        const items = tasks.items ?? [];
        return [...items].sort((a, b) => compareSortOrder(a, b, sortOrderAttribute));
    }, [tasks, sortOrderAttribute]);

    const displayItemsFlat = localOrder ?? sortedItems;

    const taskGroups = useMemo(
        () => (grouped ? buildTaskGroups(props, localTasksBySectionId) : []),
        [grouped, localTasksBySectionId, props]
    );

    useEffect(() => {
        setLocalOrder(undefined);
    }, [sortedItems]);

    useEffect(() => {
        setLocalTasksBySectionId(undefined);
    }, [sortedItems, sections, taskSection]);

    const listReady = tasks.status === ValueStatus.Available;

    const checkModeProgress = useMemo(() => {
        if (!checkMode) {
            return { checked: 0, total: 0 };
        }
        const items = grouped ? taskGroups.flatMap(g => g.tasks) : displayItemsFlat;
        let checked = 0;
        for (const item of items) {
            const checkedEv = taskCheckedAttribute?.get(item);
            if (
                checkedEv &&
                checkedEv.status === ValueStatus.Available &&
                checkedEv.value != null &&
                Boolean(checkedEv.value)
            ) {
                checked += 1;
            }
        }
        return { checked, total: items.length };
    }, [checkMode, grouped, taskGroups, displayItemsFlat, taskCheckedAttribute]);

    const sortOrderStatesFlat = useMemo(
        () => displayItemsFlat.map(it => sortOrderAttribute.get(it)),
        [displayItemsFlat, sortOrderAttribute]
    );

    const allTaskItems = useMemo(() => tasks.items ?? [], [tasks]);

    const inlineEditHint: ReactNode = useMemo(() => {
        if (checkMode) {
            return null;
        }
        if (widgetReadOnly === true) {
            return (
                <p className="widget-custom-dnd-tasklist__hint">
                    インライン編集が無効です。このウィジェットの「編集可否」を「はい」または編集可能になる条件にしてください。
                </p>
            );
        }
        return null;
    }, [checkMode, widgetReadOnly]);

    const sortOrderStatesAll = useMemo(
        () => allTaskItems.map(it => sortOrderAttribute.get(it)),
        [allTaskItems, sortOrderAttribute]
    );

    const taskSectionStates = useMemo(() => {
        if (!grouped || !taskSection) {
            return [];
        }
        return allTaskItems.map(it => taskSection.get(it));
    }, [grouped, taskSection, allTaskItems]);

    const sortOrderAttrsLoadingFlat = sortOrderStatesFlat.some(ev => ev.status === ValueStatus.Loading);
    const sortOrderAttrsReadyFlat =
        sortOrderStatesFlat.length > 0 && sortOrderStatesFlat.every(ev => ev.status === ValueStatus.Available);

    const sortOrderAttrsLoadingAll = sortOrderStatesAll.some(ev => ev.status === ValueStatus.Loading);
    const sortOrderAttrsReadyAll =
        sortOrderStatesAll.length === 0 || sortOrderStatesAll.every(ev => ev.status === ValueStatus.Available);

    const taskSectionAttrsLoading = taskSectionStates.some(ev => ev.status === ValueStatus.Loading);

    const canReorderFlat = sortOrderAttrsReadyFlat;
    /**
     * セクション参照（taskSection）が一部 Unavailable でも SortOrder が取れていれば DnD 可能にする。
     * 以前は taskSection がすべて Available になるまで canReorderGrouped=false となり、
     * 新規タスクや未関連タスクがあると並べ替え全体が止まっていた。
     */
    const canReorderGrouped = sortOrderAttrsReadyAll;

    const persistOrderFlat = useCallback(
        (reordered: ObjectItem[]) => {
            if (!canReorderFlat) {
                return;
            }
            const persistAct = onPersistSortOrder;
            if (persistAct != null) {
                if (persistAct.isExecuting) {
                    return;
                }
                if (persistAct.canExecute) {
                    persistAct.execute({ sortOrderPayload: serializeSortOrderPayload(reordered) });
                    window.setTimeout(() => {
                        tasks.reload();
                        onSortOrderChanged?.execute();
                    }, 0);
                    return;
                }
                console.warn(
                    "CustomDnDTaskList: onPersistSortOrder.canExecute is false (e.g. editability or MF parameters). Falling back to client-side setValue; if this fails, fix the action in Studio."
                );
            }
            try {
                for (let i = 0; i < reordered.length; i++) {
                    const ev = sortOrderAttribute.get(reordered[i]);
                    if (ev.status === ValueStatus.Available) {
                        ev.setValue(new Big(i + 1));
                    }
                }
            } catch (e) {
                // Mendix: list datasource attributes may not support setValue — configure onPersistSortOrder.
                console.warn(
                    "CustomDnDTaskList: SortOrder setValue failed; set the widget action onPersistSortOrder to persist order.",
                    e
                );
                return;
            }
            tasks.reload();
            onSortOrderChanged?.execute();
        },
        [canReorderFlat, onPersistSortOrder, onSortOrderChanged, sortOrderAttribute, tasks]
    );

    const persistOrderInSection = useCallback(
        (reorderedInSection: ObjectItem[]) => {
            if (!canReorderGrouped) {
                return;
            }
            const persistAct = onPersistSortOrder;
            if (persistAct != null) {
                if (persistAct.isExecuting) {
                    return;
                }
                if (persistAct.canExecute) {
                    persistAct.execute({ sortOrderPayload: serializeSortOrderPayload(reorderedInSection) });
                    window.setTimeout(() => {
                        tasks.reload();
                        onSortOrderChanged?.execute();
                    }, 0);
                    return;
                }
                console.warn(
                    "CustomDnDTaskList: onPersistSortOrder.canExecute is false (e.g. editability or MF parameters). Falling back to client-side setValue; if this fails, fix the action in Studio."
                );
            }
            try {
                for (let i = 0; i < reorderedInSection.length; i++) {
                    const ev = sortOrderAttribute.get(reorderedInSection[i]);
                    if (ev.status === ValueStatus.Available) {
                        ev.setValue(new Big(i + 1));
                    }
                }
            } catch (e) {
                console.warn(
                    "CustomDnDTaskList: SortOrder setValue failed; set the widget action onPersistSortOrder to persist order.",
                    e
                );
                return;
            }
            tasks.reload();
            onSortOrderChanged?.execute();
        },
        [canReorderGrouped, onPersistSortOrder, onSortOrderChanged, sortOrderAttribute, tasks]
    );

    const handleInlineAddCommit = useCallback(
        (sectionItem: ObjectItem, title: string) => {
            if (!onInlineAddTask) {
                return;
            }
            const act = onInlineAddTask.get(sectionItem);
            if (!act.canExecute || act.isExecuting) {
                return;
            }
            act.execute({ newTaskTitle: title });
            setInlineAddSectionKey(null);
            setInlineAddDraft("");
            tasks.reload();
        },
        [onInlineAddTask, tasks]
    );

    const handleInlineAddSectionCommit = useCallback(
        (title: string) => {
            if (!onInlineAddSection) {
                return;
            }
            if (!onInlineAddSection.canExecute || onInlineAddSection.isExecuting) {
                return;
            }
            onInlineAddSection.execute({ newSectionTitle: title });
            setInlineAddSectionExpanded(false);
            setInlineAddSectionDraft("");
            sections?.reload();
        },
        [onInlineAddSection, sections]
    );

    const handleBeginInlineEdit = useCallback((item: ObjectItem, field: InlineEditField, initialDraft: string) => {
        setInlineEditKey(`${item.id}:${field}`);
        setInlineEditDraft(initialDraft);
    }, []);

    const handleInlineFieldCommit = useCallback(
        (item: ObjectItem, field: InlineEditField, draft: string) => {
            if (field === "title" && taskNameAttribute) {
                const act = onTaskTitleCommitted?.get(item);
                if (act?.canExecute && !act.isExecuting) {
                    act.execute({ newTitle: draft });
                } else {
                    const ev = taskNameAttribute.get(item);
                    if (ev.status === ValueStatus.Available) {
                        try {
                            ev.setValue(draft);
                        } catch (e) {
                            console.warn(
                                "CustomDnDTaskList: task name setValue is not supported for this attribute; configure onTaskTitleCommitted.",
                                e
                            );
                        }
                    }
                }
            } else if (field === "description" && taskDescriptionAttribute) {
                const act = onTaskDescriptionCommitted?.get(item);
                if (act?.canExecute && !act.isExecuting) {
                    act.execute({ newDescription: draft });
                } else {
                    const ev = taskDescriptionAttribute.get(item);
                    if (ev.status === ValueStatus.Available) {
                        try {
                            ev.setValue(draft);
                        } catch (e) {
                            console.warn(
                                "CustomDnDTaskList: task description setValue is not supported for this attribute; configure onTaskDescriptionCommitted.",
                                e
                            );
                        }
                    }
                }
            }
            setInlineEditKey(null);
            setInlineEditDraft("");
            tasks.reload();
        },
        [onTaskDescriptionCommitted, onTaskTitleCommitted, taskDescriptionAttribute, taskNameAttribute, tasks]
    );

    const handleInlineFieldCancel = useCallback(() => {
        setInlineEditKey(null);
        setInlineEditDraft("");
    }, []);

    const handleBeginSectionInlineEdit = useCallback((sectionItem: ObjectItem, initialDraft: string) => {
        setInlineSectionEditKey(sectionItem.id);
        setInlineSectionEditDraft(initialDraft);
    }, []);

    const handleSectionTitleCommit = useCallback(
        (sectionItem: ObjectItem, draft: string) => {
            if (!sectionNameAttribute) {
                setInlineSectionEditKey(null);
                setInlineSectionEditDraft("");
                return;
            }

            const act = onSectionTitleCommitted?.get(sectionItem);
            if (act?.canExecute && !act.isExecuting) {
                act.execute({ newTitle: draft });
            } else {
                const ev = sectionNameAttribute.get(sectionItem);
                if (ev.status === ValueStatus.Available) {
                    try {
                        ev.setValue(draft);
                    } catch (e) {
                        console.warn(
                            "CustomDnDTaskList: section title setValue is not supported for this attribute; configure onSectionTitleCommitted.",
                            e
                        );
                    }
                }
            }

            setInlineSectionEditKey(null);
            setInlineSectionEditDraft("");
            sections?.reload();
        },
        [onSectionTitleCommitted, sectionNameAttribute, sections]
    );

    const handleSectionTitleCancel = useCallback(() => {
        setInlineSectionEditKey(null);
        setInlineSectionEditDraft("");
    }, []);

    const collapseInlineAdd = useCallback(() => {
        setInlineAddSectionKey(null);
        setInlineAddDraft("");
    }, []);

    const collapseInlineAddSection = useCallback(() => {
        setInlineAddSectionExpanded(false);
        setInlineAddSectionDraft("");
    }, []);

    useEffect(() => {
        if (checkMode) {
            return;
        }
        const listening =
            inlineEditKey != null ||
            inlineAddSectionKey != null ||
            inlineSectionEditKey != null ||
            inlineAddSectionExpanded;
        if (!listening) {
            return;
        }

        const onPointerDownCapture = (e: PointerEvent): void => {
            const root = widgetRootRef.current;
            if (!root) {
                return;
            }
            const t = e.target;
            if (!(t instanceof Node) || root.contains(t)) {
                return;
            }

            suppressInputBlurCommitRef.current = true;

            if (inlineEditKey != null) {
                const sep = inlineEditKey.lastIndexOf(":");
                if (sep > 0) {
                    const itemId = inlineEditKey.slice(0, sep);
                    const field = inlineEditKey.slice(sep + 1);
                    const item = (tasks.items ?? []).find(it => it.id === itemId);
                    if (item && (field === "title" || field === "description")) {
                        handleInlineFieldCommit(item, field as InlineEditField, inlineEditDraft);
                    } else {
                        setInlineEditKey(null);
                        setInlineEditDraft("");
                    }
                }
            } else if (inlineSectionEditKey != null) {
                const sec = (sections?.items ?? []).find(s => s.id === inlineSectionEditKey);
                if (sec) {
                    handleSectionTitleCommit(sec, inlineSectionEditDraft);
                } else {
                    setInlineSectionEditKey(null);
                    setInlineSectionEditDraft("");
                }
            } else if (inlineAddSectionKey != null && onInlineAddTask) {
                const group = taskGroups.find(g => g.sectionKey === inlineAddSectionKey);
                const sectionItem = group?.sectionItem;
                if (
                    sectionItem != null &&
                    group?.sectionKey !== ORPHAN_SECTION_KEY &&
                    inlineAddSectionKey !== ORPHAN_SECTION_KEY
                ) {
                    const trimmed = inlineAddDraft.trim();
                    if (trimmed !== "") {
                        handleInlineAddCommit(sectionItem, trimmed);
                    } else {
                        collapseInlineAdd();
                    }
                } else {
                    collapseInlineAdd();
                }
            } else if (inlineAddSectionExpanded && onInlineAddSection) {
                const trimmed = inlineAddSectionDraft.trim();
                if (trimmed !== "") {
                    handleInlineAddSectionCommit(trimmed);
                } else {
                    collapseInlineAddSection();
                }
            }

            if (blurSuppressResetTimerRef.current !== undefined) {
                window.clearTimeout(blurSuppressResetTimerRef.current);
            }
            blurSuppressResetTimerRef.current = window.setTimeout(() => {
                blurSuppressResetTimerRef.current = undefined;
                suppressInputBlurCommitRef.current = false;
            }, 0);
        };

        document.addEventListener("pointerdown", onPointerDownCapture, true);
        return () => {
            document.removeEventListener("pointerdown", onPointerDownCapture, true);
            if (blurSuppressResetTimerRef.current !== undefined) {
                window.clearTimeout(blurSuppressResetTimerRef.current);
                blurSuppressResetTimerRef.current = undefined;
            }
        };
    }, [
        collapseInlineAdd,
        collapseInlineAddSection,
        handleInlineAddCommit,
        handleInlineAddSectionCommit,
        handleInlineFieldCommit,
        handleSectionTitleCommit,
        inlineAddDraft,
        inlineAddSectionKey,
        inlineAddSectionDraft,
        inlineAddSectionExpanded,
        inlineEditDraft,
        inlineEditKey,
        inlineSectionEditDraft,
        inlineSectionEditKey,
        onInlineAddTask,
        onInlineAddSection,
        sections,
        taskGroups,
        tasks
    ]);

    const onDragStart = useCallback(
        (item: ObjectItem) => (e: DragEvent) => {
            if (checkMode) {
                e.preventDefault();
                return;
            }
            const allow = grouped ? canReorderGrouped : canReorderFlat;
            if (!allow) {
                e.preventDefault();
                return;
            }
            draggingIdRef.current = item.id;
            setDraggingId(item.id);
            e.dataTransfer.effectAllowed = "move";
            try {
                e.dataTransfer.setData("text/plain", item.id);
            } catch {
                // IE / strict environments
            }
        },
        [checkMode, grouped, canReorderFlat, canReorderGrouped]
    );

    const onDragEnd = useCallback(() => {
        draggingIdRef.current = undefined;
        setDraggingId(undefined);
    }, []);

    const onDragOverRow = useCallback((e: DragEvent) => {
        if (checkMode) {
            return;
        }
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    }, [checkMode]);

    const onDropOnRowFlat = useCallback(
        (targetIndex: number) => (e: DragEvent) => {
            e.preventDefault();
            if (checkMode) {
                return;
            }
            const activeDragId = draggingIdRef.current ?? draggingId;
            if (!canReorderFlat || activeDragId == null) {
                draggingIdRef.current = undefined;
                setDraggingId(undefined);
                return;
            }
            const fromIndex = displayItemsFlat.findIndex(it => it.id === activeDragId);
            if (fromIndex < 0 || fromIndex === targetIndex) {
                draggingIdRef.current = undefined;
                setDraggingId(undefined);
                return;
            }
            const next = [...displayItemsFlat];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(targetIndex, 0, moved);
            setLocalOrder(next);
            persistOrderFlat(next);
            draggingIdRef.current = undefined;
            setDraggingId(undefined);
        },
        [checkMode, displayItemsFlat, draggingId, persistOrderFlat, canReorderFlat]
    );

    const onDropOnRowGrouped = useCallback(
        (sectionKey: string, targetIndex: number) => (e: DragEvent) => {
            e.preventDefault();
            if (checkMode) {
                return;
            }
            const activeDragId = draggingIdRef.current ?? draggingId;
            if (!canReorderGrouped || activeDragId == null) {
                draggingIdRef.current = undefined;
                setDraggingId(undefined);
                return;
            }
            const group = taskGroups.find(g => g.sectionKey === sectionKey);
            if (!group) {
                draggingIdRef.current = undefined;
                setDraggingId(undefined);
                return;
            }
            const displayTasks = group.tasks;
            const fromIndex = displayTasks.findIndex(it => it.id === activeDragId);
            if (fromIndex < 0 || fromIndex === targetIndex) {
                draggingIdRef.current = undefined;
                setDraggingId(undefined);
                return;
            }
            const next = [...displayTasks];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(targetIndex, 0, moved);
            setLocalTasksBySectionId(prev => ({ ...(prev ?? {}), [sectionKey]: next }));
            persistOrderInSection(next);
            draggingIdRef.current = undefined;
            setDraggingId(undefined);
        },
        [checkMode, taskGroups, draggingId, persistOrderInSection, canReorderGrouped]
    );

    const commitCheckToggle = useCallback(
        (item: ObjectItem, next: boolean): void => {
            const act = onTaskCheckedCommitted?.get(item);
            const checkedEv = taskCheckedAttribute?.get(item);
            if (act?.canExecute && !act.isExecuting) {
                act.execute({ newChecked: next });
                window.setTimeout(() => tasks.reload(), 0);
                return;
            }
            if (!checkedEv || checkedEv.status !== ValueStatus.Available) {
                return;
            }
            try {
                checkedEv.setValue(next);
                window.setTimeout(() => tasks.reload(), 0);
            } catch (err) {
                console.warn(
                    "CustomDnDTaskList: taskCheckedAttribute setValue is not supported for this attribute; configure onTaskCheckedCommitted to persist.",
                    err
                );
            }
        },
        [onTaskCheckedCommitted, taskCheckedAttribute, tasks]
    );

    const renderCheckModeTableRow = useCallback(
        (item: ObjectItem): ReactElement => {
            const titleEv = taskNameAttribute?.get(item);
            const title =
                titleEv && titleEv.status === ValueStatus.Available && titleEv.value != null && String(titleEv.value).trim() !== ""
                    ? String(titleEv.value)
                    : item.id;

            const checkedEv = taskCheckedAttribute?.get(item);
            const checked =
                checkedEv && checkedEv.status === ValueStatus.Available && checkedEv.value != null
                    ? Boolean(checkedEv.value)
                    : false;

            const act = onTaskCheckedCommitted?.get(item);
            const canToggle =
                widgetReadOnly !== true &&
                ((act?.canExecute === true && !act.isExecuting) ||
                    (checkedEv != null &&
                        checkedEv.status === ValueStatus.Available &&
                        typeof checkedEv.setValue === "function"));

            const onToggle = (): void => {
                if (!canToggle) {
                    return;
                }
                commitCheckToggle(item, !checked);
            };

            const chevronAct = onCheckModeChevron?.get(item);

            return (
                <tr key={item.id} className="widget-custom-dnd-tasklist__checklist-row">
                    <td className="widget-custom-dnd-tasklist__checklist-cell widget-custom-dnd-tasklist__checklist-cell--status">
                        <button
                            type="button"
                            className={classNames("widget-custom-dnd-tasklist__status-toggle", {
                                "widget-custom-dnd-tasklist__status-toggle--checked": checked,
                                "widget-custom-dnd-tasklist__status-toggle--unchecked": !checked
                            })}
                            disabled={!canToggle}
                            onClick={onToggle}
                            onPointerDown={e => e.stopPropagation()}
                            aria-pressed={checked}
                            aria-label={`${title} のチェックを切り替え`}
                        >
                            <span className="widget-custom-dnd-tasklist__status-toggle-mark" aria-hidden>
                                {checked ? "✓" : "−"}
                            </span>
                        </button>
                    </td>
                    <td className="widget-custom-dnd-tasklist__checklist-cell widget-custom-dnd-tasklist__checklist-cell--item">
                        <div className="widget-custom-dnd-tasklist__checklist-item-main">
                            <span className="widget-custom-dnd-tasklist__checklist-item-text" title={title}>
                                {title}
                            </span>
                            {onCheckModeChevron && chevronAct ? (
                                <button
                                    type="button"
                                    className="widget-custom-dnd-tasklist__checklist-chevron-btn"
                                    aria-label={`${title} の詳細`}
                                    title="開く"
                                    disabled={!chevronAct.canExecute || chevronAct.isExecuting}
                                    onPointerDown={e => e.stopPropagation()}
                                    onClick={e => {
                                        e.stopPropagation();
                                        runListAction(onCheckModeChevron, item);
                                    }}
                                >
                                    <span className="widget-custom-dnd-tasklist__checklist-chevron-mark" aria-hidden>
                                        ›
                                    </span>
                                </button>
                            ) : (
                                <span className="widget-custom-dnd-tasklist__checklist-chevron" aria-hidden>
                                    ›
                                </span>
                            )}
                        </div>
                    </td>
                </tr>
            );
        },
        [commitCheckToggle, onCheckModeChevron, taskNameAttribute, widgetReadOnly]
    );

    const renderTaskRow = (
        item: ObjectItem,
        dropHandler: (e: DragEvent) => void,
        canReorder: boolean
    ): ReactElement => {
        return (
            <li
                key={item.id}
                className={classNames("widget-custom-dnd-tasklist__row", {
                    "widget-custom-dnd-tasklist__row--dragging": draggingId === item.id
                })}
                onDragOver={onDragOverRow}
                onDrop={dropHandler}
            >
                <div
                    className={classNames("widget-custom-dnd-tasklist__handle", {
                        "widget-custom-dnd-tasklist__handle--disabled": !canReorder
                    })}
                    draggable={canReorder}
                    onDragStart={onDragStart(item)}
                    onDragEnd={onDragEnd}
                    title={canReorder ? "ドラッグして並べ替え" : undefined}
                    aria-grabbed={draggingId === item.id}
                >
                    <span className="widget-custom-dnd-tasklist__handle-icon" aria-hidden>
                        ⋮⋮
                    </span>
                </div>
                <TaskRowEditableBody
                    widgetName={name}
                    item={item}
                    taskNameAttribute={taskNameAttribute}
                    taskDescriptionAttribute={taskDescriptionAttribute}
                    descriptionMaxLines={descriptionMaxLines}
                    editingKey={inlineEditKey}
                    draft={inlineEditDraft}
                    onDraftChange={setInlineEditDraft}
                    onBeginEdit={handleBeginInlineEdit}
                    onCommit={handleInlineFieldCommit}
                    onCancel={handleInlineFieldCancel}
                    parentBlurSuppressionRef={suppressInputBlurCommitRef}
                />
                <TaskRowActionIcons item={item} onTaskDetail={onTaskDetail} onTaskDelete={onTaskDelete} />
            </li>
        );
    };

    if (tasks.status === ValueStatus.Loading && (tasks.items == null || tasks.items.length === 0)) {
        return (
            <div
                ref={setWidgetRootEl}
                className={classNames("widget-custom-dnd-tasklist", className)}
                data-widget={name}
            >
                <div className="widget-custom-dnd-tasklist__loading">読み込み中…</div>
            </div>
        );
    }

    if (
        grouped &&
        sections != null &&
        sections.status === ValueStatus.Loading &&
        (sections.items == null || sections.items.length === 0)
    ) {
        return (
            <div
                ref={setWidgetRootEl}
                className={classNames("widget-custom-dnd-tasklist", className)}
                data-widget={name}
            >
                <div className="widget-custom-dnd-tasklist__loading">セクションを読み込み中…</div>
            </div>
        );
    }

    if (grouped && sections != null && sections.status !== ValueStatus.Available) {
        return (
            <div
                ref={setWidgetRootEl}
                className={classNames("widget-custom-dnd-tasklist", className)}
                data-widget={name}
            >
                <div className="widget-custom-dnd-tasklist__loading">セクションを読み込み中…</div>
            </div>
        );
    }

    if (grouped && !listReady) {
        return (
            <div
                ref={setWidgetRootEl}
                className={classNames("widget-custom-dnd-tasklist", className)}
                data-widget={name}
            >
                <div className="widget-custom-dnd-tasklist__loading">タスクを読み込み中…</div>
            </div>
        );
    }

    if (grouped && listReady && allTaskItems.length > 0 && (sortOrderAttrsLoadingAll || taskSectionAttrsLoading)) {
        return (
            <div
                ref={setWidgetRootEl}
                className={classNames("widget-custom-dnd-tasklist", className)}
                data-widget={name}
            >
                <div className="widget-custom-dnd-tasklist__loading">タスクの関連データを読み込み中…</div>
            </div>
        );
    }

    if (grouped && listReady) {
        const showSortHint =
            !checkMode &&
            taskGroups.some(g => g.tasks.length > 0) &&
            !sortOrderAttrsLoadingAll &&
            !sortOrderAttrsReadyAll;

        const canEditSectionTitles = !checkMode && widgetReadOnly !== true && sectionNameAttribute != null;
        const canAddSection = !checkMode && widgetReadOnly !== true && onInlineAddSection != null;

        return (
            <div
                ref={setWidgetRootEl}
                className={classNames("widget-custom-dnd-tasklist", className, {
                    "widget-custom-dnd-tasklist--checkmode": checkMode
                })}
                data-widget={name}
            >
                {showSortHint ? (
                    <p className="widget-custom-dnd-tasklist__hint">
                        SortOrder
                        の値が一部の行で未取得です。ページを再表示するか、データソースの設定を確認してください。
                    </p>
                ) : null}
                {inlineEditHint}
                {checkMode ? (
                    <div className="widget-custom-dnd-tasklist__checklist-card">
                        <div className="widget-custom-dnd-tasklist__checklist-head">
                            <h2 className="widget-custom-dnd-tasklist__checklist-title">点検チェックリスト</h2>
                            <span className="widget-custom-dnd-tasklist__checklist-badge">
                                {checkModeProgress.checked} / {checkModeProgress.total}
                            </span>
                        </div>
                        <div className="widget-custom-dnd-tasklist__checklist-sections">
                            {taskGroups.map(group => (
                                <div key={group.sectionKey} className="widget-custom-dnd-tasklist__checklist-section">
                                    <h3
                                        className="widget-custom-dnd-tasklist__checklist-section-heading"
                                        id={`${name}-section-${group.sectionKey}`}
                                    >
                                        {group.sectionTitle}
                                    </h3>
                                    <table className="widget-custom-dnd-tasklist__checklist-table">
                                        <thead>
                                            <tr>
                                                <th className="widget-custom-dnd-tasklist__checklist-th" scope="col">
                                                    状態
                                                </th>
                                                <th className="widget-custom-dnd-tasklist__checklist-th" scope="col">
                                                    点検項目
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>{group.tasks.map(item => renderCheckModeTableRow(item))}</tbody>
                                    </table>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="widget-custom-dnd-tasklist__sections">
                        {taskGroups.map(group => (
                        <section
                            key={group.sectionKey}
                            className="widget-custom-dnd-tasklist__section"
                            aria-labelledby={`${name}-section-${group.sectionKey}`}
                        >
                            {(() => {
                                const editable =
                                    canEditSectionTitles &&
                                    group.sectionItem != null &&
                                    group.sectionKey !== ORPHAN_SECTION_KEY;
                                const editing =
                                    group.sectionItem != null && inlineSectionEditKey === group.sectionItem.id;

                                const titleId = `${name}-section-${group.sectionKey}`;
                                const inputId = `${name}-section-title-input-${group.sectionKey}`;

                                const attrEv = group.sectionItem ? sectionNameAttribute?.get(group.sectionItem) : undefined;
                                const raw =
                                    attrEv && attrEv.status === ValueStatus.Available && attrEv.value != null
                                        ? String(attrEv.value)
                                        : "";

                                const beginEditPointer = (e: ReactPointerEvent): void => {
                                    if (!editable || group.sectionItem == null) {
                                        return;
                                    }
                                    if (e.pointerType === "mouse" && e.button !== 0) {
                                        return;
                                    }
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleBeginSectionInlineEdit(group.sectionItem, raw);
                                    window.setTimeout(() => sectionTitleInputRef.current?.focus(), 0);
                                };

                                const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
                                    if (!group.sectionItem) {
                                        return;
                                    }
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        skipSectionBlurCommitRef.current = true;
                                        handleSectionTitleCommit(group.sectionItem, inlineSectionEditDraft);
                                        window.requestAnimationFrame(() => {
                                            skipSectionBlurCommitRef.current = false;
                                        });
                                    } else if (e.key === "Escape") {
                                        e.preventDefault();
                                        skipSectionBlurCommitRef.current = true;
                                        handleSectionTitleCancel();
                                        window.requestAnimationFrame(() => {
                                            skipSectionBlurCommitRef.current = false;
                                        });
                                    }
                                };

                                const onInputBlur = (): void => {
                                    if (skipSectionBlurCommitRef.current || suppressInputBlurCommitRef.current) {
                                        return;
                                    }
                                    if (group.sectionItem) {
                                        handleSectionTitleCommit(group.sectionItem, inlineSectionEditDraft);
                                    }
                                };

                                if (editing && group.sectionItem) {
                                    return (
                                        <div
                                            id={titleId}
                                            className="widget-custom-dnd-tasklist__section-title-wrap"
                                            aria-label="セクション名"
                                        >
                                            <label
                                                htmlFor={inputId}
                                                className="widget-custom-dnd-tasklist__visually-hidden"
                                            >
                                                セクション名
                                            </label>
                                            <input
                                                ref={sectionTitleInputRef}
                                                id={inputId}
                                                type="text"
                                                className="widget-custom-dnd-tasklist__inline-edit-input widget-custom-dnd-tasklist__section-title-input"
                                                value={inlineSectionEditDraft}
                                                onChange={e => setInlineSectionEditDraft(e.target.value)}
                                                onPointerDown={e => e.stopPropagation()}
                                                onBlur={onInputBlur}
                                                onKeyDown={onInputKeyDown}
                                                autoComplete="off"
                                            />
                                        </div>
                                    );
                                }

                                return (
                                    <h3
                                        className={classNames("widget-custom-dnd-tasklist__section-title", {
                                            "widget-custom-dnd-tasklist__section-title--editable": editable
                                        })}
                                        id={titleId}
                                        role={editable ? "button" : undefined}
                                        tabIndex={editable ? 0 : undefined}
                                        onPointerDown={beginEditPointer}
                                        onKeyDown={e => {
                                            if (!editable || group.sectionItem == null) {
                                                return;
                                            }
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                handleBeginSectionInlineEdit(group.sectionItem, raw);
                                                window.setTimeout(() => sectionTitleInputRef.current?.focus(), 0);
                                            }
                                        }}
                                    >
                                        {group.sectionTitle}
                                    </h3>
                                );
                            })()}
                            <ul
                                className="widget-custom-dnd-tasklist__list widget-custom-dnd-tasklist__list--nested"
                                onDragOver={onDragOverRow}
                            >
                                {group.tasks.map((item, index) =>
                                    renderTaskRow(item, onDropOnRowGrouped(group.sectionKey, index), canReorderGrouped)
                                )}
                                {!checkMode &&
                                onInlineAddTask &&
                                group.sectionItem != null &&
                                group.sectionKey !== ORPHAN_SECTION_KEY ? (
                                    <SectionInlineTaskAdd
                                        widgetName={name}
                                        sectionKey={group.sectionKey}
                                        expanded={inlineAddSectionKey === group.sectionKey}
                                        draft={inlineAddSectionKey === group.sectionKey ? inlineAddDraft : ""}
                                        onDraftChange={setInlineAddDraft}
                                        onExpand={() => {
                                            setInlineAddSectionKey(group.sectionKey);
                                            setInlineAddDraft("");
                                        }}
                                        onCollapse={() => {
                                            setInlineAddSectionKey(k => (k === group.sectionKey ? null : k));
                                            setInlineAddDraft("");
                                        }}
                                        onCommit={trimmed => handleInlineAddCommit(group.sectionItem!, trimmed)}
                                        busy={onInlineAddTask.get(group.sectionItem).isExecuting}
                                        canTrigger={onInlineAddTask.get(group.sectionItem).canExecute}
                                        parentBlurSuppressionRef={suppressInputBlurCommitRef}
                                    />
                                ) : null}
                            </ul>
                        </section>
                        ))}
                    </div>
                )}
                {canAddSection ? (
                    <InlineAddSection
                        widgetName={name}
                        expanded={inlineAddSectionExpanded}
                        draft={inlineAddSectionDraft}
                        onDraftChange={setInlineAddSectionDraft}
                        onExpand={() => {
                            setInlineAddSectionExpanded(true);
                            setInlineAddSectionDraft("");
                        }}
                        onCollapse={() => collapseInlineAddSection()}
                        onCommit={trimmed => handleInlineAddSectionCommit(trimmed)}
                        busy={onInlineAddSection.isExecuting}
                        canTrigger={onInlineAddSection.canExecute}
                        parentBlurSuppressionRef={suppressInputBlurCommitRef}
                    />
                ) : null}
            </div>
        );
    }

    if (listReady && displayItemsFlat.length > 0 && sortOrderAttrsLoadingFlat) {
        return (
            <div
                ref={setWidgetRootEl}
                className={classNames("widget-custom-dnd-tasklist", className)}
                data-widget={name}
            >
                <div className="widget-custom-dnd-tasklist__loading">並び順（SortOrder）を読み込み中…</div>
            </div>
        );
    }

    if (!listReady || displayItemsFlat.length === 0) {
        return (
            <div
                ref={setWidgetRootEl}
                className={classNames("widget-custom-dnd-tasklist", className)}
                data-widget={name}
            >
                <div className="widget-custom-dnd-tasklist__empty">タスクがありません。</div>
            </div>
        );
    }

    return (
        <div
            ref={setWidgetRootEl}
            className={classNames("widget-custom-dnd-tasklist", className, {
                "widget-custom-dnd-tasklist--checkmode": checkMode
            })}
            data-widget={name}
        >
            {displayItemsFlat.length > 0 &&
            !checkMode &&
            !sortOrderAttrsLoadingFlat &&
            !sortOrderAttrsReadyFlat ? (
                <p className="widget-custom-dnd-tasklist__hint">
                    SortOrder の値が一部の行で未取得です。ページを再表示するか、データソースの設定を確認してください。
                </p>
            ) : null}
            {inlineEditHint}
            {checkMode ? (
                <div className="widget-custom-dnd-tasklist__checklist-card">
                    <div className="widget-custom-dnd-tasklist__checklist-head">
                        <h2 className="widget-custom-dnd-tasklist__checklist-title">点検チェックリスト</h2>
                        <span className="widget-custom-dnd-tasklist__checklist-badge">
                            {checkModeProgress.checked} / {checkModeProgress.total}
                        </span>
                    </div>
                    <table className="widget-custom-dnd-tasklist__checklist-table">
                        <thead>
                            <tr>
                                <th className="widget-custom-dnd-tasklist__checklist-th" scope="col">
                                    状態
                                </th>
                                <th className="widget-custom-dnd-tasklist__checklist-th" scope="col">
                                    点検項目
                                </th>
                            </tr>
                        </thead>
                        <tbody>{displayItemsFlat.map(item => renderCheckModeTableRow(item))}</tbody>
                    </table>
                </div>
            ) : (
                <ul className="widget-custom-dnd-tasklist__list" onDragOver={onDragOverRow}>
                    {displayItemsFlat.map((item, index) => renderTaskRow(item, onDropOnRowFlat(index), canReorderFlat))}
                </ul>
            )}
        </div>
    );
}
