# Helix Usage Monitor

**Author:** MonGauss

A SillyTavern extension that displays API usage information for `https://helixmind.online` API users, helping them track their message consumption and upcoming reset times.

## Features

*   **Current Usage Display:** Shows the number of messages used within the current 24-hour rolling window.
*   **Total Limit Indication:** If your key has a daily limit, it displays usage as "X / Y messages"; otherwise, it shows "X messages".
*   **Next Message Countdown:** A real-time countdown timer indicates when the next message slot is expected to become available based on the oldest message used in the last 24 hours.
*   **Conditional Activation:** The extension's UI automatically activates and deactivates based on whether SillyTavern's "Custom Endpoint" is configured to `https://helixmind.online`.

*   **Hourly Reset Breakdown (Optional):**
    *   Users can enable a setting to view an hourly breakdown of when their used messages are scheduled to reset.
    *   Displays counts for "Today" (from the current hour onwards) and "Tomorrow".
    *   Example: "Resetting by 2 PM: 5 messages".

*   **Automatic Refresh:** Usage data refreshes automatically when a generation ends or when a countdown timer expires.

## Requirements/Prerequisites

*   A working installation of **SillyTavern** (1.12.14 or later).
*   An **API key** for the `https://helixmind.online` service.
*   SillyTavern must be configured to use the **"Custom Endpoint"** API provider.
    *   The URL for the custom endpoint must be set to `https://helixmind.online` (or start with it).
    *   Your HelixMind API key must be entered into the API key field for the "Custom" provider in SillyTavern's API settings.
*   The setting `allowKeysExposure: true` must be enabled in SillyTavern's `config.yaml` file. This allows the extension to make requests to the usage endpoint for your key. If you change this setting, a SillyTavern server restart is necessary.

## Installation

1. Navigate to the SillyTavern Extensions menu by clicking the building blocks icon in the top bar.
2. Open the "Install Extension" pop-up window.
3. In the Install from URL section, enter `https://github.com/DAurielS/ST-HelixUsage`.
4. Click "Install just for me" and wait for the extension to download and install.

## Usage

1.  **Configuration:** Ensure SillyTavern is configured as per the "Requirements/Prerequisites" section, especially the `config.yaml` setting.
2.  **Automatic Display:** Once correctly configured and the HelixMind endpoint is active, the "Helix Usage Monitor" panel will automatically appear in the left navigation panel of SillyTavern. It will display your current usage and the countdown to the next message.

## Troubleshooting

*   **UI Shows "Key Error" for Messages Used / Next Message In:**
    *   Verify that your API key for `https://helixmind.online` is correctly entered in SillyTavern's API settings for the "Custom" provider.
    *   Ensure `allowKeysExposure: true` is set in your SillyTavern `config.yaml` file and that you've restarted SillyTavern after the change.
*   **UI Shows "Error" for Messages Used / Next Message In:**
    *   Check your internet connection.
    *   Ensure the `https://helixmind.online` API endpoint is reachable and not experiencing downtime.
*   **UI Does Not Appear:**
    *   Double-check that SillyTavern's "API Source" is set to "Custom Endpoint".
    *   Confirm the "Custom Endpoint URL" in SillyTavern's API settings starts exactly with `https://helixmind.online`.

## License

This project is licensed under the GNU GPLv3 License - see the LICENSE file for details.