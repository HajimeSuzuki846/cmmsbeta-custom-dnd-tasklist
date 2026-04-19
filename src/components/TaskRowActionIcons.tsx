import { type MouseEvent, type PointerEvent, ReactElement } from "react";
import type { ListActionValue, ObjectItem } from "mendix";

function stopPointerForDrag(e: MouseEvent | PointerEvent): void {
    e.stopPropagation();
}

export function DetailIcon(): ReactElement {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden focusable="false">
            <path
                fill="currentColor"
                d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8l-7-5zm0 2.4L18.4 9H14V5.4zM7 17v-2h6v2H7zm8-4H7v-2h8v2z"
            />
        </svg>
    );
}

export function DeleteIcon(): ReactElement {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden focusable="false">
            <path
                fill="currentColor"
                d="M9 3v1H5v2h1v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6h1V4h-4V3H9zm0 5h2v10H9V8zm4 0h2v10h-2V8z"
            />
        </svg>
    );
}

function runListAction(listAction: ListActionValue | undefined, item: ObjectItem): void {
    if (!listAction) {
        return;
    }
    const action = listAction.get(item);
    if (!action.canExecute || action.isExecuting) {
        return;
    }
    action.execute();
}

export function TaskRowActionIcons(props: {
    item: ObjectItem;
    onTaskDetail?: ListActionValue;
    onTaskDelete?: ListActionValue;
}): ReactElement | null {
    const { item, onTaskDetail, onTaskDelete } = props;
    if (!onTaskDetail && !onTaskDelete) {
        return null;
    }

    return (
        <div
            className="widget-custom-dnd-tasklist__row-actions"
            onMouseDown={stopPointerForDrag}
            onPointerDown={stopPointerForDrag}
        >
            {onTaskDetail ? (
                <button
                    type="button"
                    className="widget-custom-dnd-tasklist__icon-btn"
                    aria-label="詳細"
                    title="詳細"
                    disabled={!onTaskDetail.get(item).canExecute}
                    onClick={e => {
                        stopPointerForDrag(e);
                        runListAction(onTaskDetail, item);
                    }}
                >
                    <DetailIcon />
                </button>
            ) : null}
            {onTaskDelete ? (
                <button
                    type="button"
                    className="widget-custom-dnd-tasklist__icon-btn widget-custom-dnd-tasklist__icon-btn--danger"
                    aria-label="削除"
                    title="削除"
                    disabled={!onTaskDelete.get(item).canExecute}
                    onClick={e => {
                        stopPointerForDrag(e);
                        runListAction(onTaskDelete, item);
                    }}
                >
                    <DeleteIcon />
                </button>
            ) : null}
        </div>
    );
}
