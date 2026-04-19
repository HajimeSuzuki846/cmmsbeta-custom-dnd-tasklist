import { type DragEvent, type ReactNode, ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import classNames from "classnames";
import Big from "big.js";
import { ObjectItem, ValueStatus } from "mendix";
import { CustomDnDTaskListContainerProps } from "../../typings/CustomDnDTaskListProps";
import { TaskRowActionIcons } from "./TaskRowActionIcons";
import { SectionInlineTaskAdd } from "./SectionInlineTaskAdd";
import { TaskRowEditableBody, type InlineEditField } from "./TaskRowEditableBody";

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
    const {
        name,
        class: className,
        sections,
        tasks,
        taskSection,
        sortOrderAttribute,
        taskNameAttribute,
        taskDescriptionAttribute,
        descriptionMaxLines,
        onTaskDetail,
        onTaskDelete,
        onInlineAddTask,
        onTaskTitleCommitted,
        onTaskDescriptionCommitted,
        onPersistSortOrder,
        onSortOrderChanged
    } = props;

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

    const widgetRootRef = useRef<HTMLDivElement | null>(null);
    const suppressInputBlurCommitRef = useRef(false);
    const blurSuppressResetTimerRef = useRef<number | undefined>(undefined);
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

    const sortOrderStatesFlat = useMemo(
        () => displayItemsFlat.map(it => sortOrderAttribute.get(it)),
        [displayItemsFlat, sortOrderAttribute]
    );

    const allTaskItems = useMemo(() => tasks.items ?? [], [tasks]);

    const inlineEditHint: ReactNode = useMemo(() => {
        if (widgetReadOnly === true) {
            return (
                <p className="widget-custom-dnd-tasklist__hint">
                    インライン編集が無効です。このウィジェットの「編集可否」を「はい」または編集可能になる条件にしてください。
                </p>
            );
        }
        return null;
    }, [widgetReadOnly]);

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
                if (!persistAct.canExecute) {
                    console.warn(
                        "CustomDnDTaskList: onPersistSortOrder.canExecute is false (e.g. editability or MF parameters). Attempting execute anyway; if nothing runs, fix the action in Studio."
                    );
                }
                persistAct.execute({ sortOrderPayload: serializeSortOrderPayload(reordered) });
                window.setTimeout(() => {
                    tasks.reload();
                    onSortOrderChanged?.execute();
                }, 0);
                return;
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
                if (!persistAct.canExecute) {
                    console.warn(
                        "CustomDnDTaskList: onPersistSortOrder.canExecute is false (e.g. editability or MF parameters). Attempting execute anyway; if nothing runs, fix the action in Studio."
                    );
                }
                persistAct.execute({ sortOrderPayload: serializeSortOrderPayload(reorderedInSection) });
                window.setTimeout(() => {
                    tasks.reload();
                    onSortOrderChanged?.execute();
                }, 0);
                return;
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

    const collapseInlineAdd = useCallback(() => {
        setInlineAddSectionKey(null);
        setInlineAddDraft("");
    }, []);

    useEffect(() => {
        const listening = inlineEditKey != null || inlineAddSectionKey != null;
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
        handleInlineAddCommit,
        handleInlineFieldCommit,
        inlineAddDraft,
        inlineAddSectionKey,
        inlineEditDraft,
        inlineEditKey,
        onInlineAddTask,
        taskGroups,
        tasks
    ]);

    const onDragStart = useCallback(
        (item: ObjectItem) => (e: DragEvent) => {
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
        [grouped, canReorderFlat, canReorderGrouped]
    );

    const onDragEnd = useCallback(() => {
        draggingIdRef.current = undefined;
        setDraggingId(undefined);
    }, []);

    const onDragOverRow = useCallback((e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    }, []);

    const onDropOnRowFlat = useCallback(
        (targetIndex: number) => (e: DragEvent) => {
            e.preventDefault();
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
        [displayItemsFlat, draggingId, persistOrderFlat, canReorderFlat]
    );

    const onDropOnRowGrouped = useCallback(
        (sectionKey: string, targetIndex: number) => (e: DragEvent) => {
            e.preventDefault();
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
        [taskGroups, draggingId, persistOrderInSection, canReorderGrouped]
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
            taskGroups.some(g => g.tasks.length > 0) && !sortOrderAttrsLoadingAll && !sortOrderAttrsReadyAll;

        return (
            <div
                ref={setWidgetRootEl}
                className={classNames("widget-custom-dnd-tasklist", className)}
                data-widget={name}
            >
                {showSortHint ? (
                    <p className="widget-custom-dnd-tasklist__hint">
                        SortOrder
                        の値が一部の行で未取得です。ページを再表示するか、データソースの設定を確認してください。
                    </p>
                ) : null}
                {inlineEditHint}
                <div className="widget-custom-dnd-tasklist__sections">
                    {taskGroups.map(group => (
                        <section
                            key={group.sectionKey}
                            className="widget-custom-dnd-tasklist__section"
                            aria-labelledby={`${name}-section-${group.sectionKey}`}
                        >
                            <h3
                                className="widget-custom-dnd-tasklist__section-title"
                                id={`${name}-section-${group.sectionKey}`}
                            >
                                {group.sectionTitle}
                            </h3>
                            <ul
                                className="widget-custom-dnd-tasklist__list widget-custom-dnd-tasklist__list--nested"
                                onDragOver={onDragOverRow}
                            >
                                {group.tasks.map((item, index) =>
                                    renderTaskRow(item, onDropOnRowGrouped(group.sectionKey, index), canReorderGrouped)
                                )}
                                {onInlineAddTask &&
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
        <div ref={setWidgetRootEl} className={classNames("widget-custom-dnd-tasklist", className)} data-widget={name}>
            {displayItemsFlat.length > 0 && !sortOrderAttrsLoadingFlat && !sortOrderAttrsReadyFlat ? (
                <p className="widget-custom-dnd-tasklist__hint">
                    SortOrder の値が一部の行で未取得です。ページを再表示するか、データソースの設定を確認してください。
                </p>
            ) : null}
            {inlineEditHint}
            <ul className="widget-custom-dnd-tasklist__list" onDragOver={onDragOverRow}>
                {displayItemsFlat.map((item, index) => renderTaskRow(item, onDropOnRowFlat(index), canReorderFlat))}
            </ul>
        </div>
    );
}
