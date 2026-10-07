#!/usr/bin/env python3
"""Create the dedicated 2md Grafana dashboard; preserve any existing live copy."""

from __future__ import annotations

import base64
import argparse
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen


API_ROOT = os.environ.get("GRAFANA_URL", "http://127.0.0.1:8007").rstrip("/") + "/api"
USERNAME = os.environ.get("GRAFANA_USER")
PASSWORD = os.environ.get("GRAFANA_PASSWORD")
FOLDER_UID = "2md-aiurl-tw"
FOLDER_TITLE = "2md.aiurl.tw"
DASHBOARD_UID = "2md-request-analytics"
TEMPLATE = Path(__file__).resolve().parents[1] / "deploy/monitoring/grafana/2md-request-analytics.json"


def api(path: str, method: str = "GET", body: dict | None = None):
    if not USERNAME or not PASSWORD:
        raise RuntimeError("GRAFANA_USER and GRAFANA_PASSWORD must be set")
    headers = {
        "Accept": "application/json",
        "Authorization": "Basic " + base64.b64encode(f"{USERNAME}:{PASSWORD}".encode()).decode(),
    }
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    request = Request(API_ROOT + path, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=20) as response:
            payload = response.read()
            return response.status, json.loads(payload) if payload else {}
    except HTTPError as error:
        payload = error.read()
        detail = json.loads(payload) if payload else {}
        if error.code == 404:
            return 404, detail
        raise RuntimeError(f"Grafana API {method} {path} returned HTTP {error.code}: {detail}") from error


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--update", action="store_true", help="patch datasource and query definitions onto the live dashboard")
    args = parser.parse_args()

    status, datasources = api("/datasources")
    if status != 200:
        raise RuntimeError("Could not list Grafana data sources")
    influx = next((item for item in datasources if item.get("name") == "InfluxDB-telegraf"), None)
    if not influx or influx.get("type") != "influxdb":
        raise RuntimeError("Grafana datasource 'InfluxDB-telegraf' was not found or has the wrong type")
    datasource_settings = influx.get("jsonData", {})
    if datasource_settings.get("defaultBucket") != "telegraf" or datasource_settings.get("organization") != "main":
        raise RuntimeError("Grafana datasource does not point to the expected main/telegraf bucket")

    status, existing = api(f"/dashboards/uid/{DASHBOARD_UID}")
    if status == 200:
        dashboard = existing.get("dashboard", {})
        if not args.update:
            print(f"Dashboard already exists; preserving live version {dashboard.get('version')} at {existing.get('meta', {}).get('url')}")
            return
        template = json.loads(TEMPLATE.read_text())
        live_panels = {panel.get("id"): panel for panel in dashboard.get("panels", [])}
        for template_panel in template.get("panels", []):
            panel_id = template_panel.get("id")
            if panel_id not in live_panels:
                raise RuntimeError(f"Live dashboard is missing expected panel id {panel_id}; refusing to replace it")
            source = template_panel.get("datasource")
            if source and source.get("uid") == "__INFLUX_DS_UID__":
                source["uid"] = influx["uid"]
            panel = live_panels[panel_id]
            for key in ("title", "description", "datasource", "targets"):
                if key in template_panel:
                    panel[key] = template_panel[key]
        dashboard["version"] = dashboard.get("version", 0)
        folder_uid = existing.get("meta", {}).get("folderUid", FOLDER_UID)
        message = "Update 2md dashboard query definitions from the checked-in template"
        overwrite = True
    else:
        dashboard = json.loads(TEMPLATE.read_text())
        for panel in dashboard.get("panels", []):
            source = panel.get("datasource")
            if source and source.get("uid") == "__INFLUX_DS_UID__":
                source["uid"] = influx["uid"]
        folder_uid = FOLDER_UID
        message = "Create dedicated 2md.aiurl.tw request analytics dashboard"
        overwrite = False

    if status == 404:
        folder_status, folder = api(f"/folders/{FOLDER_UID}")
        if folder_status == 404:
            _, folder = api("/folders", "POST", {"uid": FOLDER_UID, "title": FOLDER_TITLE})
        folder_uid = folder.get("uid", FOLDER_UID)

    payload = {
        "dashboard": dashboard,
        "folderUid": folder_uid,
        "overwrite": overwrite,
        "message": message,
    }
    _, result = api("/dashboards/db", "POST", payload)

    status, live = api(f"/dashboards/uid/{DASHBOARD_UID}")
    if status != 200:
        raise RuntimeError("Grafana accepted the dashboard write but it could not be read back")
    live_dashboard = live.get("dashboard", {})
    if len(live_dashboard.get("panels", [])) != len(dashboard.get("panels", [])):
        raise RuntimeError("Grafana dashboard read-back panel count does not match the submitted template")
    print(json.dumps({
        "status": result.get("status"),
        "title": live_dashboard.get("title"),
        "uid": live_dashboard.get("uid"),
        "folder": live.get("meta", {}).get("folderTitle"),
        "panels": len(live_dashboard.get("panels", [])),
        "url": live.get("meta", {}).get("url"),
    }))


if __name__ == "__main__":
    main()
