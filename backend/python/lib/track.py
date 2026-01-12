import numpy as np

def build_track_from_telemetry(telemetry_data, track_width=200):
    """
    Build track geometry from telemetry data.
    Track width of 200 is used for visual display (not realistic F1 track width).
    """
    try:
        plot_x_ref = telemetry_data["X"].to_numpy()
        plot_y_ref = telemetry_data["Y"].to_numpy()
        
        dx = np.gradient(plot_x_ref)
        dy = np.gradient(plot_y_ref)
        
        norm = np.sqrt(dx**2 + dy**2)
        norm[norm == 0] = 1.0
        dx /= norm
        dy /= norm
        
        # Compute perpendicular normals
        nx = -dy
        ny = dx
        
        x_outer = plot_x_ref + nx * (track_width / 2)
        y_outer = plot_y_ref + ny * (track_width / 2)
        x_inner = plot_x_ref - nx * (track_width / 2)
        y_inner = plot_y_ref - ny * (track_width / 2)
        
        drs_zones = extract_drs_zones(telemetry_data)
        
        x_min = float(min(plot_x_ref.min(), x_inner.min(), x_outer.min()))
        x_max = float(max(plot_x_ref.max(), x_inner.max(), x_outer.max()))
        y_min = float(min(plot_y_ref.min(), y_inner.min(), y_outer.min()))
        y_max = float(max(plot_y_ref.max(), y_inner.max(), y_outer.max()))
        
        return {
            "centerline": {
                "x": plot_x_ref.tolist(),
                "y": plot_y_ref.tolist()
            },
            "boundaries": {
                "inner": {
                    "x": x_inner.tolist(),
                    "y": y_inner.tolist()
                },
                "outer": {
                    "x": x_outer.tolist(),
                    "y": y_outer.tolist()
                }
            },
            "bounds": {
                "x_min": x_min,
                "x_max": x_max,
                "y_min": y_min,
                "y_max": y_max
            },
            "drs_zones": drs_zones,
            "track_width": track_width
        }
    except Exception as e:
        print(f"Error building track: {e}")
        return None

def extract_drs_zones(telemetry_data):
    """
    Extract DRS zones from telemetry.
    DRS values: 10, 12, 14 indicate DRS active/available.
    """
    try:
        x_val = telemetry_data["X"]
        y_val = telemetry_data["Y"]
        drs_column = telemetry_data["DRS"]
        
        drs_zones = []
        drs_start = None
        
        for i, val in enumerate(drs_column):
            if val in [10, 12, 14]:
                if drs_start is None:
                    drs_start = i
            else:
                if drs_start is not None:
                    drs_end = i - 1
                    zone = {
                        "start": {
                            "x": float(x_val.iloc[drs_start]),
                            "y": float(y_val.iloc[drs_start]),
                            "index": int(drs_start)
                        },
                        "end": {
                            "x": float(x_val.iloc[drs_end]),
                            "y": float(y_val.iloc[drs_end]),
                            "index": int(drs_end)
                        }
                    }
                    drs_zones.append(zone)
                    drs_start = None
        
        if drs_start is not None:
            drs_end = len(drs_column) - 1
            zone = {
                "start": {
                    "x": float(x_val.iloc[drs_start]),
                    "y": float(y_val.iloc[drs_start]),
                    "index": int(drs_start)
                },
                "end": {
                    "x": float(x_val.iloc[drs_end]),
                    "y": float(y_val.iloc[drs_end]),
                    "index": int(drs_end)
                }
            }
            drs_zones.append(zone)
        
        return drs_zones
    except Exception as e:
        print(f"Error extracting DRS zones: {e}")
        return []
