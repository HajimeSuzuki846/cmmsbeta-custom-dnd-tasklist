import { ReactElement } from "react";
import { CustomDnDTaskListPreviewProps } from "../typings/CustomDnDTaskListProps";
import { DeleteIcon, DetailIcon } from "./components/TaskRowActionIcons";

function previewTaskRow(): ReactElement {
    return (
        <li className="widget-custom-dnd-tasklist__row">
            <div className="widget-custom-dnd-tasklist__handle widget-custom-dnd-tasklist__handle--disabled">
                <span className="widget-custom-dnd-tasklist__handle-icon" aria-hidden>
                    ⋮⋮
                </span>
            </div>
            <div className="widget-custom-dnd-tasklist__body">
                <div className="widget-custom-dnd-tasklist__title">（プレビュー）タスク名</div>
                <div className="widget-custom-dnd-tasklist__description">説明文の例です。</div>
            </div>
            <div className="widget-custom-dnd-tasklist__row-actions">
                <button type="button" className="widget-custom-dnd-tasklist__icon-btn" disabled aria-hidden>
                    <DetailIcon />
                </button>
                <button
                    type="button"
                    className="widget-custom-dnd-tasklist__icon-btn widget-custom-dnd-tasklist__icon-btn--danger"
                    disabled
                    aria-hidden
                >
                    <DeleteIcon />
                </button>
            </div>
        </li>
    );
}

export function preview(_props: CustomDnDTaskListPreviewProps): ReactElement {
    return (
        <div className="widget-custom-dnd-tasklist widget-custom-dnd-tasklist--preview">
            <div className="widget-custom-dnd-tasklist__sections">
                <section className="widget-custom-dnd-tasklist__section">
                    <h3 className="widget-custom-dnd-tasklist__section-title">（プレビュー）セクション 1</h3>
                    <ul className="widget-custom-dnd-tasklist__list widget-custom-dnd-tasklist__list--nested">
                        <li className="widget-custom-dnd-tasklist__row widget-custom-dnd-tasklist__row--add-trigger">
                            <div
                                className="widget-custom-dnd-tasklist__handle widget-custom-dnd-tasklist__handle--placeholder"
                                aria-hidden
                            />
                            <div className="widget-custom-dnd-tasklist__body widget-custom-dnd-tasklist__body--add-trigger">
                                <button type="button" className="widget-custom-dnd-tasklist__add-trigger" disabled>
                                    タスクを追加…
                                </button>
                            </div>
                        </li>
                    </ul>
                </section>
                <section className="widget-custom-dnd-tasklist__section">
                    <h3 className="widget-custom-dnd-tasklist__section-title">（プレビュー）セクション 2</h3>
                    <ul className="widget-custom-dnd-tasklist__list widget-custom-dnd-tasklist__list--nested">
                        {previewTaskRow()}
                        <li className="widget-custom-dnd-tasklist__row widget-custom-dnd-tasklist__row--add-trigger">
                            <div
                                className="widget-custom-dnd-tasklist__handle widget-custom-dnd-tasklist__handle--placeholder"
                                aria-hidden
                            />
                            <div className="widget-custom-dnd-tasklist__body widget-custom-dnd-tasklist__body--add-trigger">
                                <button type="button" className="widget-custom-dnd-tasklist__add-trigger" disabled>
                                    タスクを追加…
                                </button>
                            </div>
                        </li>
                    </ul>
                </section>
            </div>
        </div>
    );
}

export function getPreviewCss(): string {
    return require("./ui/CustomDnDTaskList.css");
}
