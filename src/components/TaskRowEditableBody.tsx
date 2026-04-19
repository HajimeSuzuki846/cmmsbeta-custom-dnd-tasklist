import {
    type CSSProperties,
    type KeyboardEvent,
    type MutableRefObject,
    type PointerEvent,
    type ReactElement,
    useEffect,
    useRef
} from "react";
import classNames from "classnames";
import { ListAttributeValue, ObjectItem, ValueStatus } from "mendix";

type StringAttr = ReturnType<NonNullable<ListAttributeValue<string>["get"]>>;

/**
 * 文字列属性が利用可能。list attribute では readOnly が実態とずれることがあるため、
 * 表示・インライン編集は status === Available のみで判定する（確定時の保存は親で MF または setValue）。
 */
function isStringAttrAvailable(ev: StringAttr | undefined): ev is StringAttr {
    return ev != null && ev.status === ValueStatus.Available;
}

export type InlineEditField = "title" | "description";

export type TaskRowEditableBodyProps = {
    widgetName: string;
    item: ObjectItem;
    taskNameAttribute?: ListAttributeValue<string>;
    taskDescriptionAttribute?: ListAttributeValue<string>;
    descriptionMaxLines: number;
    /** `${item.id}:title` | `${item.id}:description` | null */
    editingKey: string | null;
    draft: string;
    onDraftChange: (value: string) => void;
    onBeginEdit: (item: ObjectItem, field: InlineEditField, initialDraft: string) => void;
    onCommit: (item: ObjectItem, field: InlineEditField, draft: string) => void;
    onCancel: () => void;
    /** 親がウィジェット外クリックで確定した直後、二重 commit / blur を防ぐ */
    parentBlurSuppressionRef?: MutableRefObject<boolean>;
};

export function TaskRowEditableBody(props: TaskRowEditableBodyProps): ReactElement {
    const {
        widgetName,
        item,
        taskNameAttribute,
        taskDescriptionAttribute,
        descriptionMaxLines,
        editingKey,
        draft,
        onDraftChange,
        onBeginEdit,
        onCommit,
        onCancel,
        parentBlurSuppressionRef
    } = props;

    const titleKey = `${item.id}:title`;
    const descKey = `${item.id}:description`;
    const editingTitle = editingKey === titleKey;
    const editingDesc = editingKey === descKey;

    const nameEv = taskNameAttribute?.get(item);
    const descEv = taskDescriptionAttribute?.get(item);

    const hasNameAttr = taskNameAttribute != null;
    const hasDescAttr = taskDescriptionAttribute != null;

    const nameReadable = isStringAttrAvailable(nameEv);
    const nameEditable = isStringAttrAvailable(nameEv);
    const descReadable = isStringAttrAvailable(descEv);
    const descEditable = isStringAttrAvailable(descEv);

    const nameRaw = nameReadable && nameEv.value != null ? String(nameEv.value) : "";
    const nameShown = nameRaw.trim() !== "" ? nameRaw : "";

    const descRaw = descReadable && descEv.value != null ? String(descEv.value) : "";
    const descShown = descRaw.trim();

    const titleInputRef = useRef<HTMLInputElement>(null);
    const descInputRef = useRef<HTMLTextAreaElement>(null);
    const skipBlurCommitRef = useRef(false);

    useEffect(() => {
        if (editingTitle) {
            window.setTimeout(() => titleInputRef.current?.focus(), 0);
        } else if (editingDesc) {
            window.setTimeout(() => descInputRef.current?.focus(), 0);
        }
    }, [editingTitle, editingDesc]);

    const commitCurrent = (): void => {
        if (editingTitle) {
            onCommit(item, "title", draft);
        } else if (editingDesc) {
            onCommit(item, "description", draft);
        }
    };

    const onTitleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
        if (e.key === "Enter") {
            e.preventDefault();
            skipBlurCommitRef.current = true;
            onCommit(item, "title", draft);
            window.requestAnimationFrame(() => {
                skipBlurCommitRef.current = false;
            });
        } else if (e.key === "Escape") {
            e.preventDefault();
            skipBlurCommitRef.current = true;
            onCancel();
            window.requestAnimationFrame(() => {
                skipBlurCommitRef.current = false;
            });
        }
    };

    const onDescKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            skipBlurCommitRef.current = true;
            onCommit(item, "description", draft);
            window.requestAnimationFrame(() => {
                skipBlurCommitRef.current = false;
            });
        } else if (e.key === "Escape") {
            e.preventDefault();
            skipBlurCommitRef.current = true;
            onCancel();
            window.requestAnimationFrame(() => {
                skipBlurCommitRef.current = false;
            });
        }
    };

    const onFieldBlur = (): void => {
        if (skipBlurCommitRef.current || parentBlurSuppressionRef?.current) {
            return;
        }
        commitCurrent();
    };

    const descClamp = descriptionMaxLines > 0;
    const descRows = descriptionMaxLines > 0 ? Math.min(Math.max(descriptionMaxLines, 2), 8) : 3;

    const titleId = `${widgetName}-title-${item.id}`;
    const descId = `${widgetName}-desc-${item.id}`;

    const openTitleEditPointer = (e: PointerEvent): void => {
        if (e.pointerType === "mouse" && e.button !== 0) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        onBeginEdit(item, "title", nameRaw);
    };

    const openDescEditPointer = (e: PointerEvent): void => {
        if (e.pointerType === "mouse" && e.button !== 0) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        onBeginEdit(item, "description", descRaw);
    };

    const renderTitle = (): ReactElement => {
        if (editingTitle) {
            return (
                <>
                    <label htmlFor={titleId} className="widget-custom-dnd-tasklist__visually-hidden">
                        タスク名
                    </label>
                    <input
                        ref={titleInputRef}
                        id={titleId}
                        type="text"
                        className="widget-custom-dnd-tasklist__inline-edit-input"
                        value={draft}
                        onChange={e => onDraftChange(e.target.value)}
                        onPointerDown={e => e.stopPropagation()}
                        onBlur={onFieldBlur}
                        onKeyDown={onTitleKeyDown}
                        autoComplete="off"
                    />
                </>
            );
        }

        if (!hasNameAttr) {
            return <div className="widget-custom-dnd-tasklist__title">{item.id}</div>;
        }

        if (nameShown === "") {
            if (nameEditable) {
                return (
                    <div
                        id={titleId}
                        className="widget-custom-dnd-tasklist__title widget-custom-dnd-tasklist__title--editable widget-custom-dnd-tasklist__title--placeholder"
                        role="button"
                        tabIndex={0}
                        onPointerDown={openTitleEditPointer}
                        onKeyDown={e => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onBeginEdit(item, "title", nameRaw);
                            }
                        }}
                    >
                        <span className="widget-custom-dnd-tasklist__muted-placeholder">タイトルを入力</span>
                    </div>
                );
            }
            return (
                <div className="widget-custom-dnd-tasklist__title">
                    <span className="widget-custom-dnd-tasklist__muted-placeholder">（タイトルなし）</span>
                </div>
            );
        }

        if (nameEditable) {
            return (
                <div
                    id={titleId}
                    className="widget-custom-dnd-tasklist__title widget-custom-dnd-tasklist__title--editable"
                    role="button"
                    tabIndex={0}
                    onPointerDown={openTitleEditPointer}
                    onKeyDown={e => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onBeginEdit(item, "title", nameRaw);
                        }
                    }}
                >
                    {nameShown}
                </div>
            );
        }

        return <div className="widget-custom-dnd-tasklist__title">{nameShown}</div>;
    };

    const renderDescription = (): ReactElement | null => {
        if (!hasDescAttr) {
            return null;
        }

        if (editingDesc) {
            return (
                <>
                    <label htmlFor={descId} className="widget-custom-dnd-tasklist__visually-hidden">
                        タスク説明（Ctrl+Enter で確定）
                    </label>
                    <textarea
                        ref={descInputRef}
                        id={descId}
                        className="widget-custom-dnd-tasklist__inline-edit-textarea"
                        rows={descRows}
                        value={draft}
                        onChange={e => onDraftChange(e.target.value)}
                        onPointerDown={e => e.stopPropagation()}
                        onBlur={onFieldBlur}
                        onKeyDown={onDescKeyDown}
                        autoComplete="off"
                    />
                    <div className="widget-custom-dnd-tasklist__inline-edit-hint">Ctrl+Enter で確定</div>
                </>
            );
        }

        if (descShown === "") {
            if (!descEditable) {
                return null;
            }
            return (
                <div
                    id={descId}
                    className="widget-custom-dnd-tasklist__description widget-custom-dnd-tasklist__description--editable widget-custom-dnd-tasklist__description--placeholder"
                    role="button"
                    tabIndex={0}
                    onPointerDown={openDescEditPointer}
                    onKeyDown={e => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onBeginEdit(item, "description", descRaw);
                        }
                    }}
                >
                    <span className="widget-custom-dnd-tasklist__muted-placeholder">説明を追加…</span>
                </div>
            );
        }

        if (descEditable) {
            return (
                <div
                    id={descId}
                    className={classNames("widget-custom-dnd-tasklist__description", {
                        "widget-custom-dnd-tasklist__description--editable": true,
                        "widget-custom-dnd-tasklist__description--clamped": descClamp
                    })}
                    style={descClamp ? ({ WebkitLineClamp: descriptionMaxLines } as CSSProperties) : undefined}
                    role="button"
                    tabIndex={0}
                    onPointerDown={openDescEditPointer}
                    onKeyDown={e => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onBeginEdit(item, "description", descRaw);
                        }
                    }}
                >
                    {descShown}
                </div>
            );
        }

        return (
            <div
                className={classNames("widget-custom-dnd-tasklist__description", {
                    "widget-custom-dnd-tasklist__description--clamped": descClamp
                })}
                style={descClamp ? ({ WebkitLineClamp: descriptionMaxLines } as CSSProperties) : undefined}
            >
                {descShown}
            </div>
        );
    };

    return (
        <div className="widget-custom-dnd-tasklist__body">
            {renderTitle()}
            {renderDescription()}
        </div>
    );
}
