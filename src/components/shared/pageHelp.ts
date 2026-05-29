import type { InfoSection } from './InfoButton';

export interface PageHelp {
  title: string;
  summary: string;
  sections: InfoSection[];
}

/**
 * Central registry of help content for every dashboard page.
 * Edit this file to update the in-app help popups.
 */

export const dashboardHelp: PageHelp = {
  title: 'Dashboard',
  summary: 'Your home base — a quick overview of your activity and fast access to every other area of Diamond.',
  sections: [
    {
      heading: 'What you see',
      body: [
        'A welcome banner with your name.',
        'Four summary stat cards: upcoming bookings, active contacts, sessions this month, and baptisms this year.',
        'Quick-access cards that link to Calendar, Contacts, Groups, Settings, and (if you\u2019re Branch Leader or above) Reports.',
      ],
    },
    {
      heading: 'How to use it',
      body: 'Click any quick-access card to jump into that section. Use the stat cards to gauge how your week is going at a glance.',
      example: 'If "Upcoming Bookings" shows 5 and you click the Calendar card, the Calendar page will open with the current week\u2019s bookings already loaded.',
    },
    {
      heading: 'What you can\u2019t do here',
      body: 'The Dashboard is read-only. To create bookings, edit contacts, or manage groups, click into the respective pages.',
    },
  ],
};

export const calendarHelp: PageHelp = {
  title: 'Calendar',
  summary: 'MRBS-style booking grid showing every room across the current week, day, or month. This is the core of Diamond.',
  sections: [
    {
      heading: 'Views',
      body: [
        'Week: days as columns, all 8 rooms stacked side-by-side within each day. Ideal for planning the whole week.',
        'Day: rooms as columns for a single day. Easiest for spotting free slots in one specific room.',
        'Month: classic calendar grid with dot-sized bookings per day. Click any day to zoom into Day view.',
      ],
    },
    {
      heading: 'Booking a slot',
      body: [
        'Hover any empty 30-minute cell in Week or Day view \u2014 a "+" icon appears.',
        'Click the cell to open the Booking Wizard pre-filled with that room and time.',
        'Or click the "Book" button in the top-right to start from scratch.',
      ],
      example: 'Hover on Friday 10:00 am in Bible Study Room 1, click, and the wizard opens with those values selected. Pick Bible Study, a leader, in-person/Zoom, a contact, and confirm.',
    },
    {
      heading: 'Reading the booking cards',
      body: [
        'Color = booking type (blue = unbaptized, red = baptized persecuted, cyan = unbaptized Zoom, green = baptized in-person, teal = baptized Zoom, purple = group, amber = team).',
        'Narrow cards show vertical start/end times. Hover any card for a full-title tooltip.',
        'Click a booking to open the wizard in edit mode. Editing requires an "edit reason".',
      ],
    },
    {
      heading: 'Filters',
      body: 'Change the area (location) from the dropdown in the toolbar. The color-coded type legend under the toolbar shows every booking type in the system.',
    },
  ],
};

export const contactsHelp: PageHelp = {
  title: 'Contacts',
  summary: 'Every person being preached to or studied with. Track their pipeline stage, teacher, sessions, and curriculum progress.',
  sections: [
    {
      heading: 'Viewing contacts',
      body: [
        'The grid shows every contact as a card with their name, email, phone, type badge, pipeline stage indicator, and session count.',
        'Use the search box to find contacts by name or email.',
        'Use the type filter (dropdown) to narrow by the 7 booking types (Unbaptized, Baptized Persecuted, Zoom variants, etc.).',
      ],
    },
    {
      heading: 'Adding a contact',
      body: [
        'Click "Add Contact" in the top-right.',
        'Fill in Name, Phone, Group, Status (pipeline stage), up to 3 Preaching Partners, and the Initial Subject Preached.',
        'Every text field has predictive autocomplete from everything already in the system.',
        'For Initial Subject, tap any Step 1\u20135 tab to see the 10 subjects in that step, or type a custom title.',
      ],
      example: 'New contact: "Maria Garcia", phone 555-1234, group "Branch 1", status "First Study", partners Mark Davis + Grace Lee, initial subject Step 1 \u2192 "Passover, the Way to Eternal Life".',
    },
    {
      heading: 'Editing a contact',
      body: 'Click any contact card to open the edit form. Make your changes, then click Save Changes. Delete is on the right side of the form.',
    },
    {
      heading: 'How contacts feed the org tree',
      body: 'Every contact has an assigned teacher. The Groups page reads the live contact list to compute the 3 metric icons (currently studying, total studies, bearing fruit) for every person in the tree. Editing a contact\u2019s pipeline stage or session count updates the org tree immediately.',
    },
  ],
};

export const groupsHelp: PageHelp = {
  title: 'Groups & Organization',
  summary: 'Active-Directory-style org tree showing the entire church hierarchy from admin down to member. Track teacher performance and student pipeline.',
  sections: [
    {
      heading: 'Three tabs',
      body: [
        'Org Tree: the interactive hierarchy. Click any node to expand/collapse its children.',
        'Teacher Metrics: detail cards for each teacher showing total students, currently studying, continued %, and baptized %.',
        'Student Pipeline: horizontal bar chart showing how many contacts are at each pipeline stage.',
      ],
    },
    {
      heading: 'Expand / Collapse All',
      body: 'Use the buttons in the top-right to open the entire tree or close everything. By default, the top 2 levels are expanded.',
    },
    {
      heading: 'The 3 metric icons',
      body: [
        'Graduation Cap (cyan) \u2014 Currently Studying: contacts in the subtree with a session in the last 30 days.',
        'Book (blue) \u2014 Total Studies: lifetime sum of all study sessions for contacts in the subtree.',
        'Sparkles (amber) \u2014 Bearing Fruit: contacts baptized since studying with this teacher\u2019s subtree.',
        'Only Teachers, Team Leaders, Group Leaders, and Branch Leaders show icons. Overseers and Admins do not.',
      ],
    },
    {
      heading: 'Popup behavior',
      body: 'Click any icon to see the list of contacts counted toward that number. Double-click any contact in the popup to jump straight to their edit form on the Contacts page.',
      example: 'Click the graduation cap on a Group Leader\u2019s row \u2192 popup shows every contact studying in their subtree. Double-click any contact \u2192 opens the Contacts page with that person\u2019s edit form already open.',
    },
    {
      heading: 'Live updates',
      body: 'All metrics are derived from the current contacts list on the client. Editing any contact updates the icons the next time you open this page \u2014 no manual refresh needed.',
    },
  ],
};

export const settingsHelp: PageHelp = {
  title: 'Settings',
  summary: 'Your personal profile and preferences. Only you can see and edit your own settings.',
  sections: [
    {
      heading: 'Profile section',
      body: [
        'Your avatar (initials), name, and role badge appear at the top.',
        'Edit First Name, Last Name, Email, and Phone below.',
        'Click "Save Changes" to persist your edits. Your name in the sidebar updates automatically.',
      ],
    },
    {
      heading: 'Preferences',
      body: [
        'Email Notifications: receive email alerts when someone creates or edits a booking involving you.',
        'Calendar Reminders: get a reminder before each session you\u2019re attending.',
      ],
    },
    {
      heading: 'Dark / Light mode',
      body: 'The sun/moon icon in the top bar toggles dark and light themes. Your choice persists across sessions.',
    },
  ],
};

export const reportsHelp: PageHelp = {
  title: 'Reports & Audit Log',
  summary: 'Activity log of every action taken in Diamond. Restricted to Branch Leader and above.',
  sections: [
    {
      heading: 'Who can access',
      body: 'Only users with role Branch Leader, Overseer, or Dev can see this page. The Reports link is hidden from the sidebar for everyone else.',
    },
    {
      heading: 'Summary stats',
      body: 'The three cards at the top show total actions logged, actions this month, and total exports.',
    },
    {
      heading: 'Audit table',
      body: [
        'Every create / update / delete / export action is logged with timestamp, user, entity type, and a short description.',
        'Action badges are color-coded: green = create, blue = update, red = delete, purple = export.',
      ],
      example: 'You\u2019ll see entries like "Created booking: Bible Basics with Alex" or "Exported monthly activity report" with the user who performed the action and when.',
    },
    {
      heading: 'Exporting',
      body: 'Click "Export Report" in the top-right to download a CSV/PDF of the current log. (In the current mock build this shows a toast; the real backend will serve the file.)',
    },
  ],
};
