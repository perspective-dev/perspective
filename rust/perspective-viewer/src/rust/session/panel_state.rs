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

use std::collections::HashMap;
use std::rc::Rc;

use perspective_client::config::{ColumnType, Filter, ViewConfig};
use perspective_client::{Client, Description, Table};

use super::TableErrorState;
use super::metadata::SessionMetadata;
use crate::config::PluginStaticConfig;
use crate::renderer::PluginScopedConfig;

/// One panel's committed state, as ONE immutable value: a holder of an
/// `Rc<PanelState>` sees a consistent snapshot forever, and a change is a new
/// value swapped in whole.
#[derive(Clone, Default)]
pub struct PanelState {
    pub chrome: Chrome,

    /// The selected plugin, or `None` until the first run selects one.
    pub plugin: Option<PluginRef>,

    /// Every plugin's own `plugin_config` / `columns_config`, keyed by plugin
    /// name, so a swap away and back finds a plugin's config as it left it.
    pub buckets: Rc<HashMap<String, PluginScopedConfig>>,
    pub binding: Binding,

    /// The element's global filter as broadcast to this panel — the WHOLE set.
    pub overlay: Rc<Vec<OverlayClause>>,
}

/// One clause of the element-level global filter, with the type its column has
/// in the panel that BROADCAST it.
#[derive(Clone, Debug, PartialEq)]
pub struct OverlayClause {
    pub filter: Filter,
    pub column_type: Option<ColumnType>,
}

impl From<Filter> for OverlayClause {
    /// A clause with no broadcaster.
    fn from(filter: Filter) -> Self {
        Self {
            filter,
            column_type: None,
        }
    }
}

/// The config a `View` is built from: `config`, plus each `overlay` clause the
/// listening table can honor — one naming a column the listener has, with the
/// broadcaster's type.
pub fn effective(
    config: &ViewConfig,
    overlay: &[OverlayClause],
    type_of: &dyn Fn(&str) -> Option<ColumnType>,
) -> (ViewConfig, Vec<usize>) {
    let mut effective = config.clone();
    let mut skipped = Vec::new();
    for (idx, clause) in overlay.iter().enumerate() {
        let applies = match (type_of(clause.filter.column()), clause.column_type) {
            (Some(listener), Some(broadcaster)) => listener == broadcaster,
            (Some(_), None) => true,
            (None, _) => false,
        };

        if applies {
            effective.filter.push(clause.filter.clone());
        } else {
            skipped.push(idx);
        }
    }

    (effective, skipped)
}

/// Panel presentation that is not a function of the data.
#[derive(Clone, Default)]
pub struct Chrome {
    pub title: Option<String>,

    /// This panel's theme name — CONCRETE, resolved once at creation from the
    /// config's `theme`, else the host's, else the registry default.
    pub theme: Option<String>,
}

/// A plugin selection: its index in the renderer's plugin store and the static
/// config that index resolved to.
#[derive(Clone)]
pub struct PluginRef {
    pub idx: usize,
    pub static_config: Rc<PluginStaticConfig>,
}

/// What this panel is bound to.
#[derive(Clone)]
pub enum Binding {
    /// No table requested.
    Unbound {
        client: Option<Client>,
        config: Rc<ViewConfig>,
    },

    /// A named table that no client hosts yet; `client` is the one asked.
    Awaiting {
        client: Client,
        name: String,
        config: Rc<ViewConfig>,
    },

    /// Bound to `table`.
    Bound(Rc<BoundState>),

    /// The binding failed or its connection dropped.
    Lost {
        prior: Rc<Binding>,
        error: TableErrorState,
    },
}

impl Default for Binding {
    fn default() -> Self {
        Self::Unbound {
            client: None,
            config: Rc::default(),
        }
    }
}

#[derive(Clone)]
pub struct BoundState {
    pub table: Table,
    pub metadata: Rc<SessionMetadata>,
    pub config: Rc<ViewConfig>,

    /// The server's [`Description`] of the last validated effective config,
    /// keyed by that config.
    pub description: Option<(Rc<ViewConfig>, Rc<Description>)>,
}

impl Binding {
    /// This binding, seen through a [`Binding::Lost`] to what it was.
    fn live(&self) -> &Binding {
        match self {
            Binding::Lost { prior, .. } => prior,
            binding => binding,
        }
    }

    /// `f` applied to the live binding, preserving a `Lost` wrapper.
    fn map_live(&self, f: impl FnOnce(&Binding) -> Binding) -> Binding {
        match self {
            Binding::Lost { prior, error } => Binding::Lost {
                prior: Rc::new(f(prior)),
                error: error.clone(),
            },
            binding => f(binding),
        }
    }
}

impl PanelState {
    pub fn config(&self) -> &Rc<ViewConfig> {
        match self.binding.live() {
            Binding::Unbound { config, .. } | Binding::Awaiting { config, .. } => config,
            Binding::Bound(bound) => &bound.config,
            Binding::Lost { .. } => unreachable!("`Lost::prior` is never `Lost`"),
        }
    }

    /// The client this panel is bound through, awaits a table on, or will look
    /// one up on.
    pub fn client(&self) -> Option<Client> {
        match self.binding.live() {
            Binding::Unbound { client, .. } => client.clone(),
            Binding::Awaiting { client, .. } => Some(client.clone()),
            Binding::Bound(bound) => Some(bound.table.get_client()),
            Binding::Lost { .. } => unreachable!("`Lost::prior` is never `Lost`"),
        }
    }

    pub fn bound(&self) -> Option<&Rc<BoundState>> {
        match self.binding.live() {
            Binding::Bound(bound) => Some(bound),
            _ => None,
        }
    }

    pub fn awaiting(&self) -> Option<&str> {
        match self.binding.live() {
            Binding::Awaiting { name, .. } => Some(name),
            _ => None,
        }
    }

    pub fn lost(&self) -> Option<&TableErrorState> {
        match &self.binding {
            Binding::Lost { error, .. } => Some(error),
            _ => None,
        }
    }

    /// This state with its binding lost to `error`.
    pub fn with_lost(&self, error: TableErrorState) -> Self {
        Self {
            binding: Binding::Lost {
                prior: Rc::new(self.binding.live().clone()),
                error,
            },
            ..self.clone()
        }
    }

    /// This state with a lost binding recovered to what it was.
    pub fn recovered(&self) -> Self {
        Self {
            binding: self.binding.live().clone(),
            ..self.clone()
        }
    }

    /// This state with `config` in place of its view config.
    pub fn with_config(&self, config: Rc<ViewConfig>) -> Self {
        let binding = self.binding.map_live(|binding| match binding {
            Binding::Unbound { client, .. } => Binding::Unbound {
                client: client.clone(),
                config,
            },
            Binding::Awaiting { client, name, .. } => Binding::Awaiting {
                client: client.clone(),
                name: name.clone(),
                config,
            },
            Binding::Bound(bound) => Binding::Bound(Rc::new(BoundState {
                config,
                description: None,
                ..(**bound).clone()
            })),
            Binding::Lost { .. } => unreachable!("`Lost::prior` is never `Lost`"),
        });

        Self {
            binding,
            ..self.clone()
        }
    }

    /// This state with nothing bound and nothing awaited (a lost binding is
    /// replaced, not recovered); the client and config are kept.
    pub fn unbound(&self) -> Self {
        self.unbound_on(self.client())
    }

    /// This state with nothing bound, looking tables up on `client`.
    pub fn unbound_on(&self, client: Option<Client>) -> Self {
        Self {
            binding: Binding::Unbound {
                client,
                config: self.config().clone(),
            },
            ..self.clone()
        }
    }

    /// This state awaiting a host for `name` on `client`; the config is kept.
    pub fn awaiting_table(&self, client: Client, name: String) -> Self {
        Self {
            binding: Binding::Awaiting {
                client,
                name,
                config: self.config().clone(),
            },
            ..self.clone()
        }
    }

    /// This state with `overlay` broadcast to it.
    pub fn with_overlay(&self, overlay: Rc<Vec<OverlayClause>>) -> Self {
        Self {
            overlay,
            ..self.with_description(None)
        }
    }

    /// This state bound to `table`; the config is kept and nothing has been
    /// described against the new table yet.
    pub fn bound_to(&self, table: Table, metadata: SessionMetadata) -> Self {
        Self {
            binding: Binding::Bound(Rc::new(BoundState {
                table,
                metadata: Rc::new(metadata),
                config: self.config().clone(),
                description: None,
            })),
            ..self.clone()
        }
    }

    /// This state with `metadata` in place of its table metadata; a no-op
    /// unless bound.
    pub fn with_metadata(&self, metadata: Rc<SessionMetadata>) -> Self {
        let binding = self.binding.map_live(|binding| match binding {
            Binding::Bound(bound) => Binding::Bound(Rc::new(BoundState {
                metadata,
                ..(**bound).clone()
            })),
            binding => binding.clone(),
        });

        Self {
            binding,
            ..self.clone()
        }
    }

    /// This state with `description` recorded; a no-op unless bound.
    pub fn with_description(&self, description: Option<(Rc<ViewConfig>, Rc<Description>)>) -> Self {
        let binding = self.binding.map_live(|binding| match binding {
            Binding::Bound(bound) => Binding::Bound(Rc::new(BoundState {
                description,
                ..(**bound).clone()
            })),
            binding => binding.clone(),
        });

        Self {
            binding,
            ..self.clone()
        }
    }

    pub fn with_title(&self, title: Option<String>) -> Self {
        Self {
            chrome: Chrome {
                title,
                ..self.chrome.clone()
            },
            ..self.clone()
        }
    }

    pub fn with_theme(&self, theme: Option<String>) -> Self {
        Self {
            chrome: Chrome {
                theme,
                ..self.chrome.clone()
            },
            ..self.clone()
        }
    }

    pub fn with_plugin(&self, plugin: PluginRef) -> Self {
        Self {
            plugin: Some(plugin),
            ..self.clone()
        }
    }

    /// This state with no plugin selected and every bucket forgotten — a
    /// deleted renderer's selection and buckets go with it.
    pub fn without_plugins(&self) -> Self {
        Self {
            plugin: None,
            buckets: Rc::default(),
            ..self.clone()
        }
    }

    /// The named plugin's bucket, empty when it has never been written.
    pub fn bucket(&self, name: &str) -> PluginScopedConfig {
        self.buckets.get(name).cloned().unwrap_or_default()
    }

    /// This state with the named plugin's bucket replaced.
    pub fn with_bucket(&self, name: &str, bucket: PluginScopedConfig) -> Self {
        let mut buckets = (*self.buckets).clone();
        buckets.insert(name.to_owned(), bucket);
        Self {
            buckets: Rc::new(buckets),
            ..self.clone()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn clause(column: &str, column_type: Option<ColumnType>) -> OverlayClause {
        OverlayClause {
            filter: serde_json::from_value(serde_json::json!([column, "==", "x"])).unwrap(),
            column_type,
        }
    }

    fn listener(name: &str) -> Option<ColumnType> {
        match name {
            "region" => Some(ColumnType::String),
            "sales" => Some(ColumnType::Float),
            _ => None,
        }
    }

    #[test]
    fn a_clause_applies_when_the_listener_has_its_column_and_type() {
        let overlay = [clause("region", Some(ColumnType::String))];
        let (config, skipped) = effective(&ViewConfig::default(), &overlay, &listener);
        assert_eq!(config.filter, vec![overlay[0].filter.clone()]);
        assert!(skipped.is_empty());
    }

    #[test]
    fn a_clause_is_skipped_when_the_listener_types_the_column_differently() {
        let overlay = [clause("sales", Some(ColumnType::String))];
        let (config, skipped) = effective(&ViewConfig::default(), &overlay, &listener);
        assert!(config.filter.is_empty());
        assert_eq!(skipped, vec![0]);
    }

    #[test]
    fn a_clause_is_skipped_when_the_listener_lacks_the_column() {
        let overlay = [
            clause("nope", Some(ColumnType::String)),
            clause("region", Some(ColumnType::String)),
        ];

        let (config, skipped) = effective(&ViewConfig::default(), &overlay, &listener);
        assert_eq!(config.filter, vec![overlay[1].filter.clone()]);
        assert_eq!(skipped, vec![0]);
    }

    #[test]
    fn an_untyped_clause_matches_on_name() {
        let overlay = [clause("sales", None), clause("nope", None)];
        let (config, skipped) = effective(&ViewConfig::default(), &overlay, &listener);
        assert_eq!(config.filter, vec![overlay[0].filter.clone()]);
        assert_eq!(skipped, vec![1]);
    }

    #[test]
    fn the_overlay_follows_the_panel_s_own_filters() {
        let own = clause("sales", None).filter;
        let config = ViewConfig {
            filter: vec![own.clone()],
            ..ViewConfig::default()
        };

        let overlay = [clause("region", Some(ColumnType::String))];
        let (config, _) = effective(&config, &overlay, &listener);
        assert_eq!(config.filter, vec![own, overlay[0].filter.clone()]);
    }
}
