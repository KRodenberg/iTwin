#!/bin/sh
set -eu

escape_js_string() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

write_env_value() {
  key="$1"
  value="$(eval "printf '%s' \"\${$key:-}\"")"
  escaped_value="$(escape_js_string "$value")"
  printf '  %s: "%s"' "$key" "$escaped_value"
}

{
  printf 'window.__ITWIN_ENV__ = {\n'
  write_env_value IMJS_AUTH_CLIENT_CLIENT_ID; printf ',\n'
  write_env_value IMJS_AUTH_CLIENT_REDIRECT_URI; printf ',\n'
  write_env_value IMJS_AUTH_CLIENT_LOGOUT_URI; printf ',\n'
  write_env_value IMJS_AUTH_CLIENT_SCOPES; printf ',\n'
  write_env_value IMJS_AUTH_AUTHORITY; printf ',\n'
  write_env_value IMJS_ITWIN_ID; printf ',\n'
  write_env_value IMJS_IMODEL_ID; printf ',\n'
  write_env_value IMJS_BING_MAPS_KEY; printf ',\n'
  write_env_value IMJS_MAP_BOX_KEY; printf ',\n'
  write_env_value IMJS_CESIUM_ION_KEY; printf '\n'
  printf '};\n'
} > /usr/share/nginx/html/env-config.js
