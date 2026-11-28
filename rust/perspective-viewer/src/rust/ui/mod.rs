// ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
// ┃ ██████ ██████ ██████       █      █      █      █      █ █▄  ▀███ █       ┃
// ┃ ▄▄▄▄▄█ █▄▄▄▄▄ ▄▄▄▄▄█  ▀▀▀▀▀█▀▀▀▀▀ █ ▀▀▀▀▀█ ████████▌▐███ ███▄  ▀█ █ ▀▀▀▀▀ ┃
// ┃ █▀▀▀▀▀ █▀▀▀▀▀ █▀██▀▀ ▄▄▄▄▄ █ ▄▄▄▄▄█ ▄▄▄▄▄█ ████████▌▐███ █████▄   █ ▄▄▄▄▄ ┃
// ┃ █      ██████ █  ▀█▄       █ ██████      █      ███▌▐███ ███████▄ █       ┃
// ┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
// ┃ Copyright (c) 2017, the Perspective Authors.                              ┃
// ┃ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ ┃
// ┃ This file is part of the Perspective library, distributed under the terms ┃
// ┃ of the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). ┃
// ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

//! Generic widgets and DOM infrastructure with no dependency on viewer
//! state: nothing here may import `config`, `session`, `renderer`,
//! `presentation`, `tasks`, `queries`, `workspace`, `agent`,
//! `custom_elements`, `components`, or `js::plugin`.

pub mod containers;
pub mod context_menu;
pub mod dragdrop;
pub mod font_loader;
pub mod form;
pub mod modal;
pub use modal::{ModalLink, SetModalLink};
pub mod portal;
pub mod style;

pub use containers::control_group::ControlGroup;
pub use containers::dropdown_menu::{DropDownMenu, DropDownMenuItem};
pub use containers::scroll_panel::ScrollPanel;
pub use containers::scroll_panel_item::ScrollPanelItem;
pub use containers::select::{Select, SelectItem};
pub use containers::sidebar::Sidebar;
pub use containers::sidebar_close_button::SidebarCloseButton;
pub use containers::split_panel::{Orientation, SplitPanel};
pub use containers::tab_list::{TabItem, TabList};
pub use context_menu::{ContextMenu, ContextMenuEntry, ContextMenuItem};
pub use dragdrop::{
    DragDropContainer, DragEndCallback, DragTargetState, PointerDownCallback,
    clear_document_selection, closest_draggable,
};
pub use font_loader::{FontLoader, FontLoaderProps, FontLoaderStatus};
pub use form::color_selector::ColorSelector;
pub use form::intl_label::{IntlLabel, intl_content_style, intl_slug};
pub use form::mirrored_textarea::MirroredTextarea;
pub use form::multi_stop_gradient_selector::MultiStopGradientSelector;
pub use form::named_value_picker::NamedValuePicker;
pub use form::number_field::NumberField;
pub use form::number_input::NumberInput;
pub use form::number_range_field::NumberRangeField;
pub use form::optional_field::OptionalField;
pub use form::palette_selector::PaletteSelector;
pub use form::save_settings::{SaveSettings, SaveSettingsProps};
pub use form::select_enum_field::SelectEnumField;
pub use form::select_value_field::SelectValueField;
pub use portal::{MODAL_SLOT, PortalModal, session_anchor};
pub use style::StyleProvider;
