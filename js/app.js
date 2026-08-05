/* =========================================================
   EsquerrApp — Pure client-side SPA
   Auth via localStorage · Role-based dashboards
   First registered user = admin
   ========================================================= */

(function () {
  'use strict';

  // #region i18n
  // ---------- Internationalization ----------
  var _lang = localStorage.getItem('fa_lang') || 'ca';
  var _i18n = {
    // ── Sidebar ──
    'sidebar.section_player':  { ca:'Jugador', es:'Jugador', en:'Player' },
    'sidebar.player_home':     { ca:'Resum', es:'Resumen', en:'Overview' },
    'sidebar.staff_home':      { ca:'Inici', es:'Inicio', en:'Home' },
    'sidebar.training':        { ca:'Sessions d\'entrenament', es:'Sesiones de entrenamiento', en:'Training Sessions' },
    'sidebar.my_stats':        { ca:'Les meves estadístiques', es:'Mis estadísticas', en:'My Stats' },
    'sidebar.player_matchday': { ca:'Jornada', es:'Jornada', en:'Matchday' },
    'sidebar.player_actions':  { ca:'Accions', es:'Acciones', en:'Actions' },
    'sidebar.section_staff':   { ca:'Staff', es:'Staff', en:'Staff' },
    'sidebar.registrations':   { ca:'Registres', es:'Registros', en:'Registrations' },
    'sidebar.manage_roster':   { ca:'Plantilla', es:'Plantilla', en:'Player Roster' },
    'sidebar.staff_training':  { ca:'Sessions d\'entrenament', es:'Sesiones de entrenamiento', en:'Training Sessions' },
    'sidebar.matchday':        { ca:'Calendari', es:'Calendario', en:'Set Calendar' },
    'sidebar.convocatoria':    { ca:'Convocatòria', es:'Convocatoria', en:'Call-up' },
    'sidebar.staff_matchday':  { ca:'Jornada', es:'Jornada', en:'Matchday' },
    'sidebar.medical':         { ca:'Mèdic', es:'Médico', en:'Medical' },
    'sidebar.tactics':         { ca:'Pissarra tàctica', es:'Pizarra táctica', en:'Tactical Board' },
    'sidebar.notifications':   { ca:'Notificacions', es:'Notificaciones', en:'Notifications' },
    'sidebar.section_admin':   { ca:'Admin', es:'Admin', en:'Admin' },
    'sidebar.users':           { ca:'Gestió d\'usuaris', es:'Gestión de usuarios', en:'Manage Users' },
    'sidebar.settings':        { ca:'Configuració', es:'Configuración', en:'Settings' },
    'sidebar.section_teamlead':{ ca:'Team Lead', es:'Team Lead', en:'Team Lead' },
    'sidebar.staff_player_stats':{ ca:'Estadístiques', es:'Estadísticas', en:'Player Stats' },

    // ── Page Titles ──
    'page.actions':         { ca:'Accions', es:'Acciones', en:'Actions' },
    'page.my_stats':        { ca:'Les meves estadístiques', es:'Mis estadísticas', en:'My Stats' },
    'page.tactical_board':  { ca:'Pissarra tàctica', es:'Pizarra táctica', en:'Tactical Board' },
    'page.training':        { ca:'Sessions d\'entrenament', es:'Sesiones de entrenamiento', en:'Training Sessions' },
    'page.player_roster':   { ca:'Plantilla', es:'Plantilla', en:'Player Roster' },
    'page.set_calendar':    { ca:'Calendari', es:'Calendario', en:'Set Calendar' },
    'page.convocatoria':    { ca:'Convocatòria', es:'Convocatoria', en:'Call-up' },
    'page.matchday':        { ca:'Jornada', es:'Jornada', en:'Matchday' },
    'page.manage_users':    { ca:'Gestió d\'usuaris', es:'Gestión de usuarios', en:'Manage Users' },
    'users.all_users':      { ca:'Tots els usuaris', es:'Todos los usuarios', en:'All Users' },
    'users.delete_desc':    { ca:'Membres registrats en aquest club. Els rols venen de les llistes de correus (staff a «Configura el teu club», jugadors a Registres). Esborrar és permanent.', es:'Miembros registrados en este club. Los roles vienen de las listas de correos (staff en «Configura tu club», jugadores en Registros). Borrar es permanente.', en:'Members registered in this club. Roles come from the email lists (staff in "Set up your club", players in Registrations). Deleting is permanent.' },
    'users.th_name':        { ca:'Nom', es:'Nombre', en:'Name' },
    'users.th_email':       { ca:'Correu', es:'Correo', en:'Email' },
    'users.th_roles':       { ca:'Rols', es:'Roles', en:'Roles' },
    'users.th_actions':     { ca:'Accions', es:'Acciones', en:'Actions' },
    'page.registrations':   { ca:'Registres', es:'Registros', en:'Registrations' },
    'page.settings':        { ca:'Configuració', es:'Configuración', en:'Settings' },
    'page.medical':         { ca:'Mèdic', es:'Médico', en:'Medical' },
    'page.notifications':   { ca:'Notificacions', es:'Notificaciones', en:'Notifications' },

    // ── Common Buttons ──
    'btn.save':        { ca:'Desar', es:'Guardar', en:'Save' },
    'btn.cancel':      { ca:'Cancel·lar', es:'Cancelar', en:'Cancel' },
    'btn.continue':    { ca:'Continuar', es:'Continuar', en:'Continue' },
    'btn.edit':        { ca:'Editar', es:'Editar', en:'Edit' },
    'btn.delete':      { ca:'Eliminar', es:'Eliminar', en:'Delete' },
    'btn.back':        { ca:'← Enrere', es:'← Atrás', en:'← Back' },
    'btn.submit':      { ca:'Enviar', es:'Enviar', en:'Submit' },
    'btn.send':        { ca:'Enviar', es:'Enviar', en:'Send' },
    'btn.unsend':      { ca:'Retirar', es:'Retirar', en:'Unsend' },
    'btn.clear_all':   { ca:'Esborrar tot', es:'Borrar todo', en:'Clear All' },
    'btn.add':         { ca:'Afegir', es:'Añadir', en:'Add' },
    'btn.remove':      { ca:'Treure', es:'Quitar', en:'Remove' },
    'btn.leave_squad': { ca:'Treure de l\'equip', es:'Quitar del equipo', en:'Remove from squad' },
    'btn.yes_continue':{ ca:'Sí, continuar', es:'Sí, continuar', en:'Yes, continue' },
    'btn.yes_remove':  { ca:'Sí, eliminar', es:'Sí, eliminar', en:'Yes, remove' },
    'btn.no':          { ca:'No', es:'No', en:'No' },
    'btn.logout':      { ca:'Tancar sessió', es:'Cerrar sesión', en:'Logout' },
    'btn.save_changes':{ ca:'Desar canvis', es:'Guardar cambios', en:'Save Changes' },

    // ── Common ──
    'common.all':        { ca:'Tots', es:'Todos', en:'All' },
    // Plain affirmative for toggles. Deliberately not avail.yes, which is an
    // ANSWER to "are you coming?" and may well be reworded on its own.
    'common.yes':        { ca:'Sí', es:'Sí', en:'Yes' },
    'common.ok':         { ca:"D'acord", es:'De acuerdo', en:'OK' },

    // ── Team quota (commercial limit set by the superadmin) ──
    'quota.title':       { ca:"Límit d'equips assolit", es:'Límite de equipos alcanzado', en:'Team limit reached' },
    'ts.back':           { ca:'Tornar sense desar', es:'Volver sin guardar', en:'Back without saving' },
    'ts.add_team':       { ca:'Afegir equip', es:'Añadir equipo', en:'Add team' },
    'quota.add_blocked': { ca:"Per afegir un equip extra contacta amb l'administrador o elimina un dels equips actuals. Eliminar un equip comportarà la pèrdua de les dades.",
                           es:'Para añadir un equipo extra contacta con el administrador o elimina uno de los equipos actuales. Eliminar un equipo conllevará la pérdida de los datos.',
                           en:'To add an extra team contact the admin or remove one of your current teams. Removing a team will result in the loss of the data.' },
    'quota.counter':     { ca:'{n} de {max} equips', es:'{n} de {max} equipos', en:'{n} of {max} teams' },
    'quota.max_teams':   { ca:'Equips màx.', es:'Equipos máx.', en:'Max teams' },
    'quota.saved':       { ca:"Límit d'equips actualitzat.", es:'Límite de equipos actualizado.', en:'Team limit updated.' },
    'error.quota_exceeded': { ca:'Aquest club no pot tenir més de {max} equips.', es:'Este club no puede tener más de {max} equipos.', en:'This club cannot have more than {max} teams.' },
    'error.remove_team_unavailable': { ca:"Encara no es poden eliminar equips des d'aquí. Contacta amb l'administrador.", es:'Todavía no se pueden eliminar equipos desde aquí. Contacta con el administrador.', en:'Removing teams from here is not available yet. Contact the admin.' },

    // ── Over-quota gate + team deletion (deploy 2) ──
    'quota.over_staff':  { ca:'Contacta amb el responsable per gestionar els equips del club.', es:'Contacta con el responsable para gestionar los equipos del club.', en:'Contact your lead to manage the teams in the club.' },
    'quota.over_lead':   { ca:"El club té més equips dels permesos. Elimina un equip per continuar.", es:'El club tiene más equipos de los permitidos. Elimina un equipo para continuar.', en:'The club has more teams than allowed. Remove a team to continue.' },
    'team_del.title':    { ca:"Eliminar l'equip {team}", es:'Eliminar el equipo {team}', en:'Delete team {team}' },
    'team_del.msg':      { ca:"S'esborraran TOTES les dades de l'equip {team}: partits, convocatòries, disponibilitats, RPE, lesions i historial mèdic. No es pot desfer.",
                           es:'Se borrarán TODOS los datos del equipo {team}: partidos, convocatorias, disponibilidades, RPE, lesiones e historial médico. No se puede deshacer.',
                           en:'ALL data for team {team} will be erased: matches, call-ups, availability, RPE, injuries and medical history. This cannot be undone.' },
    'team_del.kept':     { ca:'Es conserven els comptes dels jugadors, que passaran a "sense equip".', es:'Se conservan las cuentas de los jugadores, que pasarán a "sin equipo".', en:'Player accounts are kept and become unassigned.' },
    'team_del.confirm_hint': { ca:'Escriu {team} per confirmar:', es:'Escribe {team} para confirmar:', en:'Type {team} to confirm:' },
    'team_del.deleting': { ca:"Eliminant l'equip…", es:'Eliminando el equipo…', en:'Deleting the team…' },
    'team_del.done':     { ca:'Equip eliminat.', es:'Equipo eliminado.', en:'Team deleted.' },
    'team_del.failed':   { ca:"No s'ha pogut eliminar l'equip. Torna-ho a provar.", es:'No se ha podido eliminar el equipo. Inténtalo de nuevo.', en:'The team could not be deleted. Try again.' },
    'team_del.last_team': { ca:'Un club ha de tenir com a mínim un equip.', es:'Un club debe tener como mínimo un equipo.', en:'A club must have at least one team.' },
    'team_del.button':   { ca:'Eliminar equip', es:'Eliminar equipo', en:'Delete team' },
    'team_del.disable_blocked': { ca:"Aquesta categoria encara té equips ({teams}). Elimina'ls un per un: en treure l'últim, la categoria es desactiva sola.",
                           es:'Esta categoría todavía tiene equipos ({teams}). Elimínalos uno a uno: al quitar el último, la categoría se desactiva sola.',
                           en:'This category still has teams ({teams}). Remove them one by one — taking the last one out disables the category by itself.' },
    'common.player':     { ca:'Jugador', es:'Jugador', en:'Player' },
    'common.staff':      { ca:'Staff', es:'Staff', en:'Staff' },
    'common.cancel':     { ca:'Cancel·lar', es:'Cancelar', en:'Cancel' },
    // ── Club lead handover (superadmin) ──
    'update.msg':        { ca:'Estàs fent servir una versió antiga de l\'app (v{have}, cal v{need}). Actualitza-la per veure-ho tot correctament.', es:'Estás usando una versión antigua de la app (v{have}, se necesita v{need}). Actualízala para verlo todo correctamente.', en:'You are running an old version of the app (v{have}, v{need} required). Update to see everything correctly.' },
    'update.download':   { ca:'Descarregar', es:'Descargar', en:'Download' },
    'club.min_version':  { ca:'Versió mínima', es:'Versión mínima', en:'Min version' },
    'club.change_lead':  { ca:'Canviar responsable', es:'Cambiar responsable', en:'Change club manager' },
    'club.change_badge': { ca:'Canviar escut (clica-hi)', es:'Cambiar escudo (haz clic)', en:'Change crest (click it)' },
    'club.badge_changed':{ ca:'Escut actualitzat.', es:'Escudo actualizado.', en:'Crest updated.' },
    'club.badge_not_image':{ ca:'El fitxer ha de ser una imatge.', es:'El archivo debe ser una imagen.', en:'The file must be an image.' },
    'club.badge_too_big':{ ca:'La imatge no pot superar els 5 MB.', es:'La imagen no puede superar los 5 MB.', en:'The image must be under 5 MB.' },
    'club.lead_found':   { ca:'✓ {name} — ja és membre del club ({roles}). Mantindrà aquests rols i passarà a ser responsable.', es:'✓ {name} — ya es miembro del club ({roles}). Mantendrá esos roles y pasará a ser responsable.', en:'✓ {name} — already a club member ({roles}). They keep those roles and become manager.' },
    'club.lead_not_registered':{ ca:'⚠ Cap membre amb aquest correu. Si és correcte, serà responsable quan es registri amb el codi del club. Comprova que no sigui un error d\'escriptura.', es:'⚠ Ningún miembro con este correo. Si es correcto, será responsable cuando se registre con el código del club. Comprueba que no sea un error de escritura.', en:'⚠ No member with that address. If it is correct they become manager when they register with the club code. Check it is not a typo.' },
    'club.lead_unchanged':{ ca:'Ja és el responsable actual.', es:'Ya es el responsable actual.', en:'Already the current manager.' },
    'club.lead_changed': { ca:'Responsable actualitzat.', es:'Responsable actualizado.', en:'Club manager updated.' },
    'common.confirm':    { ca:'Confirmar', es:'Confirmar', en:'Confirm' },
    // These three were referenced but never defined, so they rendered as raw
    // key text ("common.edit") on the medical and match pages.
    'common.edit':       { ca:'Editar', es:'Editar', en:'Edit' },
    'common.player_not_found': { ca:'Jugador no trobat', es:'Jugador no encontrado', en:'Player not found' },

    // ── Player Home ──
    'home.attendance':    { ca:'Assistència', es:'Asistencia', en:'Attendance' },
    'home.this_week':     { ca:'Aquesta setmana', es:'Esta semana', en:'This Week' },
    'home.next_week':     { ca:'Setmana vinent', es:'Próxima semana', en:'Next Week' },
    'home.change_photo':  { ca:'Canviar foto', es:'Cambiar foto', en:'Change photo' },
    'home.age_suffix':    { ca:'anys', es:'años', en:'years' },

    // ── Staff Home ──
    'shome.title':           { ca:'Resum del cos tècnic', es:'Resumen del cuerpo técnico', en:'Staff overview' },
    'shome.answered':        { ca:'han respost', es:'han respondido', en:'answered' },
    'shome.available':       { ca:'disponibles', es:'disponibles', en:'available' },
    'shome.awaiting':        { ca:'sense resposta', es:'sin respuesta', en:'no answer' },
    'shome.conv_sent':       { ca:'Convocatòria enviada', es:'Convocatoria enviada', en:'Call-up sent' },
    'shome.conv_pending':    { ca:'Convocatòria pendent', es:'Convocatoria pendiente', en:'Call-up pending' },
    'shome.out_of_action':   { ca:'Baixes', es:'Bajas', en:'Out of action' },
    'shome.none_out':        { ca:'Cap jugador lesionat. 💪', es:'Ningún jugador lesionado. 💪', en:'Nobody out injured. 💪' },
    'shome.expected_return': { ca:'Tornada prevista', es:'Vuelta prevista', en:'Expected return' },
    'shome.returning_soon':  { ca:'Torna aquesta setmana', es:'Vuelve esta semana', en:'Back this week' },
    'shome.overdue':         { ca:'Data superada', es:'Fecha superada', en:'Past due' },
    'shome.no_return_date':  { ca:'Sense data', es:'Sin fecha', en:'No date set' },
    'shome.watch_list':      { ca:'Càrrega a vigilar', es:'Carga a vigilar', en:'Load to watch' },
    'shome.none_watch':      { ca:'Cap jugador amb càrrega elevada.', es:'Ningún jugador con carga elevada.', en:'No players flagged for load.' },
    // Low load is a different problem with a different answer — build them
    // up over weeks, rather than protect them today — so it gets its own
    // list instead of the amber dot.
    'shome.underloaded':     { ca:'Càrrega baixa', es:'Carga baja', en:'Training below usual' },
    'shome.underloaded_hint':{ ca:'Entrenen per sota de la seva mitjana', es:'Entrenan por debajo de su media', en:'Training below their own average' },
    'shome.squad_size':      { ca:'jugadors', es:'jugadores', en:'players' },
    'shome.more':            { ca:'més a la plantilla', es:'más en la plantilla', en:'more in the squad' },

    // ── Week Activities ──
    'activity.badge_match':    { ca:'Partit', es:'Partido', en:'Match' },
    'activity.badge_training': { ca:'Entrenament', es:'Entrenamiento', en:'Training' },
    'activity.badge_birthday': { ca:'Aniversari', es:'Cumpleaños', en:'Birthday' },
    'activity.badge_extra':    { ca:'Extra', es:'Extra', en:'Extra' },
    'activity.conv_available': { ca:'Convocatòria disponible', es:'Convocatoria disponible', en:'Call-up available' },
    'activity.conv_not_called':{ ca:'No convocat', es:'No convocado', en:'Not called up' },
    'activity.no_activities':  { ca:'Cap activitat aquesta setmana.', es:'Sin actividades esta semana.', en:'No activities this week.' },

    // ── Availability ──
    'avail.disponible':    { ca:'Disponible', es:'Disponible', en:'Available' },
    'avail.no_disponible': { ca:'No Disponible', es:'No Disponible', en:'Not Available' },
    'avail.yes':     { ca:'Sí', es:'Sí', en:'Yes' },
    'avail.late':    { ca:'Tard', es:'Tarde', en:'Late' },
    'avail.no':      { ca:'No', es:'No', en:'No' },
    'avail.injured': { ca:'Lesionat', es:'Lesionado', en:'Injured' },
    'avail.na':      { ca:'N/A', es:'N/A', en:'N/A' },

    // ── Actions ──
    'actions.pending':       { ca:'Pendents', es:'Pendientes', en:'Pending' },
    'actions.no_pending':    { ca:'Cap acció pendent.', es:'Sin acciones pendientes.', en:'No pending actions.' },
    'actions.extra_training':{ ca:'Entrenament extra', es:'Entrenamiento extra', en:'Extra Training' },
    'actions.add_extra':     { ca:'+ Entrenament extra', es:'+ Entrenamiento extra', en:'+ Add Extra Training' },
    'actions.rpe':           { ca:'RPE', es:'RPE', en:'RPE' },
    'actions.rpe_tooltip':   { ca:'Esforç percebut (0–10)', es:'Esfuerzo percibido (0–10)', en:'Rate of Perceived Exertion (0–10)' },
    'actions.minutes':       { ca:'Minuts', es:'Minutos', en:'Minutes' },
    'actions.availability':  { ca:'Disponibilitat?', es:'¿Disponibilidad?', en:'Availability?' },

    // ── Matches / Matchday ──
    'matches.upcoming':     { ca:'Propers partits', es:'Próximos partidos', en:'Upcoming Matches' },
    'matches.previous':     { ca:'Partits anteriors', es:'Partidos anteriores', en:'Previous Matches' },
    'matches.no_upcoming':  { ca:'Cap proper partit.', es:'Sin próximos partidos.', en:'No upcoming matches.' },
    'matches.no_previous':  { ca:'Cap partit anterior.', es:'Sin partidos anteriores.', en:'No previous matches.' },
    'matches.no_past':      { ca:'Cap partit jugat.', es:'Sin partidos jugados.', en:'No matches played.' },
    'matches.conv_sent':    { ca:'Convocatòria enviada', es:'Convocatoria enviada', en:'Call-up sent' },
    'matches.players':      { ca:'jugadors', es:'jugadores', en:'players' },

    // ── Match Detail ──
    'match_detail.badge':        { ca:'Partit', es:'Partido', en:'Match' },
    'match_detail.callup':       { ca:'Citació', es:'Citación', en:'Call-up' },
    'match_detail.kickoff':      { ca:'Inici', es:'Inicio', en:'Kick-off' },
    'match_detail.called_up':    { ca:'Convocats', es:'Convocados', en:'Called Up' },
    'match_detail.events':       { ca:'Esdeveniments', es:'Eventos', en:'Events' },
    'match_detail.titulars':     { ca:'Titulars:', es:'Titulares:', en:'Starters:' },
    'match_detail.conv_available':  { ca:'Convocatòria disponible', es:'Convocatoria disponible', en:'Call-up available' },
    'match_detail.conv_not_called': { ca:'No convocat', es:'No convocado', en:'Not called up' },
    'match_detail.starter_add':     { ca:'Afegir a titulars', es:'Añadir a titulares', en:'Add to starters' },
    'match_detail.starter_remove':  { ca:'Treure de titulars', es:'Quitar de titulares', en:'Remove from starters' },
    'match_detail.not_found':       { ca:'Partit no trobat', es:'Partido no encontrado', en:'Match not found' },
    'match_detail.event_add':       { ca:'+ Esdeveniment', es:'+ Evento', en:'+ Event' },
    'match_detail.event_delete':    { ca:'Eliminar', es:'Eliminar', en:'Delete' },
    'match_detail.videos':          { ca:'🎬 Vídeos', es:'🎬 Vídeos', en:'🎬 Videos' },
    'match_detail.tactical_boards': { ca:'Pissarres tàctiques', es:'Pizarras tácticas', en:'Tactical Boards' },

    // ── Match Events ──
    'ev.goal':           { ca:'Gol', es:'Gol', en:'Goal' },
    'ev.own_goal':       { ca:'Gol en pròpia', es:'Gol en propia', en:'Own goal' },
    'ev.yellow':         { ca:'Targeta groga', es:'Tarjeta amarilla', en:'Yellow card' },
    'ev.red':            { ca:'Targeta vermella', es:'Tarjeta roja', en:'Red card' },
    'ev.change':         { ca:'Canvi', es:'Cambio', en:'Substitution' },
    'ev.penal_miss':     { ca:'Penal fallat', es:'Penal fallado', en:'Missed penalty' },
    'ev.post':           { ca:'Pal', es:'Palo', en:'Post' },
    'ev.type_ph':        { ca:'Tipus…', es:'Tipo…', en:'Type…' },
    'ev.player_ph':      { ca:'Jugador…', es:'Jugador…', en:'Player…' },
    'ev.goal_type_ph':   { ca:'Tipus de gol…', es:'Tipo de gol…', en:'Goal type…' },
    'ev.goal_penal':     { ca:'Penal', es:'Penal', en:'Penalty' },
    'ev.goal_falta':     { ca:'Falta directa', es:'Falta directa', en:'Direct free kick' },
    'ev.goal_jugada':    { ca:'Jugada oberta', es:'Jugada abierta', en:'Open play' },
    'ev.detail_ph':      { ca:'Detall…', es:'Detalle…', en:'Detail…' },
    'ev.assist':         { ca:'Assistència', es:'Asistencia', en:'Assist' },
    'ev.individual':     { ca:'Individual', es:'Individual', en:'Individual' },
    'ev.assist_ph':      { ca:'Assistent…', es:'Asistente…', en:'Assister…' },
    'ev.sub_out_ph':     { ca:'Surt…', es:'Sale…', en:'Out…' },
    'ev.sub_in_ph':      { ca:'Entra…', es:'Entra…', en:'In…' },
    'ev.minute_ph':      { ca:'Minut', es:'Minuto', en:'Minute' },
    'ev.add':            { ca:'Afegir', es:'Añadir', en:'Add' },
    'ev.opp_out':        { ca:'# Surt', es:'# Sale', en:'# Out' },
    'ev.opp_in':         { ca:'# Entra', es:'# Entra', en:'# In' },

    // ── Convocatòria ──
    'conv.choose_match':    { ca:'Tria el partit', es:'Elige el partido', en:'Choose Match' },
    'conv.select_match':    { ca:'Selecciona un partit…', es:'Selecciona un partido…', en:'Select a match…' },
    'conv.callup_time':     { ca:'Hora de citació', es:'Hora de citación', en:'Call-up Time' },
    'conv.uniform':         { ca:'Equipació', es:'Equipación', en:'Uniform' },
    'conv.jersey':          { ca:'Samarreta', es:'Camiseta', en:'Jersey' },
    'conv.socks':           { ca:'Mitges', es:'Medias', en:'Socks' },
    'conv.white':           { ca:'Blanca', es:'Blanca', en:'White' },
    'conv.yellow':          { ca:'Groga', es:'Amarilla', en:'Yellow' },
    'conv.striped':         { ca:'Ratlles', es:'Rayas', en:'Black & White' },
    'conv.available':       { ca:'Jugadors disponibles', es:'Jugadores disponibles', en:'Available Players' },
    'conv.called_up':       { ca:'Convocats', es:'Convocados', en:'Called Up' },
    'conv.no_players':      { ca:'Cap jugador disponible', es:'Sin jugadores disponibles', en:'No players available' },
    'conv.drag_desktop':    { ca:'Arrossega jugadors aquí', es:'Arrastra jugadores aquí', en:'Drag players here' },
    'conv.drag_mobile':     { ca:'Prem els jugadors per afegir-los', es:'Pulsa los jugadores para añadirlos', en:'Press players to add them' },
    'conv.tactical_board':  { ca:'Pissarra tàctica', es:'Pizarra táctica', en:'Tactical Board' },
    'conv.video_links':     { ca:'Enllaços de vídeo', es:'Enlaces de vídeo', en:'Video Links' },
    'conv.video_title_ph':  { ca:'Títol', es:'Título', en:'Title' },
    'conv.video_url_ph':    { ca:'Enganxa URL', es:'Pega URL', en:'Paste URL' },
    'conv.video_comment_ph':{ ca:'Comentaris per aquest vídeo...', es:'Comentarios para este vídeo...', en:'Comments for this video...' },
    'conv.add_video':       { ca:'+ Afegir vídeo', es:'+ Añadir vídeo', en:'+ Add Video Link' },

    // ── Set Calendar ──
    'cal.new_game':       { ca:'Nou partit', es:'Nuevo partido', en:'New Game' },
    'matches.add_game':   { ca:'Afegir partit', es:'Añadir partido', en:'Add Game' },
    'matches.past':       { ca:'Partits anteriors', es:'Partidos anteriores', en:'Past Matches' },
    'cal.th_home_away':   { ca:'Local / Visitant', es:'Local / Visitante', en:'Home / Away' },
    'cal.th_team':        { ca:'Equip', es:'Equipo', en:'Team' },
    'cal.th_date':        { ca:'Data', es:'Fecha', en:'Date' },
    'cal.th_opponent':    { ca:'Rival', es:'Rival', en:'Opponent' },
    'cal.th_location':    { ca:'Ubicació', es:'Ubicación', en:'Location' },
    'cal.th_map':         { ca:'Mapa', es:'Mapa', en:'Map' },
    'cal.th_kickoff':     { ca:'Inici', es:'Inicio', en:'Kick-off' },
    'cal.th_match':       { ca:'Partit', es:'Partido', en:'Match' },

    // ── Training ──
    'training.th_day':       { ca:'Dia', es:'Día', en:'Day' },
    'training.th_date':      { ca:'Data', es:'Fecha', en:'Date' },
    'training.th_time':      { ca:'Hora', es:'Hora', en:'Time' },
    'training.th_focus':     { ca:'Enfocament', es:'Enfoque', en:'Focus' },
    'training.th_location':  { ca:'Ubicació', es:'Ubicación', en:'Location' },
    'training.th_assistance':{ ca:'Assistència', es:'Asistencia', en:'Assistance' },
    'training.add':          { ca:'+ Entrenament', es:'+ Entrenamiento', en:'+ Add Training' },
    'training.focus_ph':     { ca:'Enfocament *', es:'Enfoque *', en:'Focus *' },
    'training.location_ph':  { ca:'Ubicació', es:'Ubicación', en:'Location' },
    'training.maplink_ph':   { ca:'Enllaç mapa', es:'Enlace mapa', en:'Map link' },
    'training.th_status':    { ca:'Estat', es:'Estado', en:'Status' },
    'training.th_attendance':{ ca:'Assistència', es:'Asistencia', en:'Attendance' },
    'training.th_link':      { ca:'Enllaç', es:'Enlace', en:'Link' },
    'training.upcoming':     { ca:'Proper', es:'Próximo', en:'Upcoming' },
    'training.completed':    { ca:'Completat', es:'Completado', en:'Completed' },
    'training.in_progress':  { ca:'En curs', es:'En curso', en:'In progress' },
    'training.badge':        { ca:'Entrenament', es:'Entrenamiento', en:'Training' },
    'training.not_found':    { ca:'Entrenament no trobat', es:'Entrenamiento no encontrado', en:'Training not found' },
    'training.tactical_boards':{ ca:'Pissarres tàctiques', es:'Pizarras tácticas', en:'Tactical Boards' },

    // ── Staff Training Detail ──
    'std.attendance_overview':{ ca:'Resum d\'assistència', es:'Resumen de asistencia', en:'Attendance Overview' },
    'std.player_attendance':  { ca:'Assistència de jugadors', es:'Asistencia de jugadores', en:'Player Attendance' },
    'std.th_pos':        { ca:'Pos', es:'Pos', en:'Pos' },
    'std.th_player':     { ca:'Jugador', es:'Jugador', en:'Player' },
    'std.th_status':     { ca:'Estat Mèdic', es:'Estado Médico', en:'Medical Status' },
    'std.th_ready':      { ca:'Forma Física', es:'Forma Física', en:'Fitness' },
    'std.th_ac_ratio':   { ca:'A/C', es:'A/C', en:'A/C Ratio' },
    'std.th_player_answer':  { ca:'Resposta jugador', es:'Respuesta jugador', en:'Player Answer' },
    'std.th_staff_editable': { ca:'Staff (editable)', es:'Staff (editable)', en:'Staff (editable)' },
    'std.planning':          { ca:'Planificació entrenament', es:'Planificación entrenamiento', en:'Training Plan' },
    'std.general_tag':       { ca:'General', es:'General', en:'General' },
    'std.all':               { ca:'Tots', es:'Todos', en:'All' },
    'std.auto_gen':          { ca:'Generador automàtic d\'equips', es:'Generador automático de equipos', en:'Auto Generate Teams' },
    'std.configure':         { ca:'⚙️ Configurar', es:'⚙️ Configurar', en:'⚙️ Configure' },
    'std.num_teams':         { ca:'Nombre d\'equips', es:'Número de equipos', en:'Number of Teams' },
    'std.players_per_team':  { ca:'Jugadors per equip', es:'Jugadores por equipo', en:'Players per Team' },
    'std.include_gk':        { ca:'Incloure porter', es:'Incluir portero', en:'Include GK' },
    'std.team_filter':       { ca:'Filtre per equip', es:'Filtro por equipo', en:'Team Filter' },
    'std.distribution':      { ca:'Distribució', es:'Distribución', en:'Distribution' },
    // These name what the split DOES. "Igualat"/"Igualado" described the old
    // behaviour, where both buttons produced a positionally balanced split.
    'std.mix':               { ca:'Equips Mixtes', es:'Equipos Mixtos', en:'Mixed Teams' },
    'std.equal':             { ca:'Per Posicions', es:'Por Posiciones', en:'By Position' },
    'std.generate':          { ca:'Generar equips', es:'Generar equipos', en:'Generate Teams' },
    'std.team_prefix':       { ca:'Equip', es:'Equipo', en:'Team' },
    'std.no_players':        { ca:'Cap jugador', es:'Sin jugadores', en:'No players' },
    'std.season_attendance': { ca:'Assistència de temporada', es:'Asistencia de temporada', en:'Season Attendance' },
    'std.total_sessions':    { ca:'Total sessions:', es:'Total sesiones:', en:'Total Sessions:' },
    'std.top_attendance':    { ca:'🏆 Millor assistència', es:'🏆 Mejor asistencia', en:'🏆 Top Attendance' },
    'std.most_absent':       { ca:'⚠️ Més absent', es:'⚠️ Más ausente', en:'⚠️ Most Absent' },
    'std.currently_injured': { ca:'❌ Lesionats', es:'❌ Lesionados', en:'❌ Currently Injured' },
    'std.none':              { ca:'Cap', es:'Ninguno', en:'None' },
    'std.week_1':            { ca:'1 setmana', es:'1 semana', en:'1 week' },
    'std.weeks':             { ca:'setmanes', es:'semanas', en:'weeks' },

    // ── Staff Roster ──
    'roster.th_pos':    { ca:'Pos', es:'Pos', en:'Pos' },
    'roster.th_name':   { ca:'Nom', es:'Nombre', en:'Name' },
    // The same two columns appear on the training-detail table as
    // std.th_status / std.th_ready — keep the wording in step.
    'roster.th_status': { ca:'Estat Mèdic', es:'Estado Médico', en:'Medical Status' },
    'roster.th_ready':  { ca:'Forma Física', es:'Forma Física', en:'Fitness' },
    'roster.th_star':   { ca:'T / S / NC', es:'T / S / NC', en:'T / S / NC' },
    'roster.th_gcm':    { ca:'GC/P', es:'GC/P', en:'GC/M' },
    'roster.gcm_title': { ca:'Contribucions de gol per partit', es:'Contribuciones de gol por partido', en:'Goal Contributions per Match' },
    'roster.all':       { ca:'Tots', es:'Todos', en:'All' },
    'roster.no_players':{ ca:'Cap jugador registrat.', es:'Sin jugadores registrados.', en:'No players registered yet.' },

    // ── Registrations ──
    'reg.card_title':   { ca:'Tots els membres registrats', es:'Todos los miembros registrados', en:'All Registered Members' },
    'reg.edit_desc':     { ca:'Edita l\'estat, posició i dorsal de cada membre. Els canvis es desen automàticament.', es:'Edita el estado, posición y dorsal de cada miembro. Los cambios se guardan automáticamente.', en:'Edit each member\'s status, position, and player number. Changes are saved automatically.' },
    'reg.th_name':      { ca:'Nom', es:'Nombre', en:'Name' },
    'reg.th_status':    { ca:'Estat', es:'Estado', en:'Status' },
    'reg.th_category':  { ca:'Categoria', es:'Categoría', en:'Category' },
    'reg.th_team':      { ca:'Equip', es:'Equipo', en:'Team' },
    'reg.th_position':  { ca:'Posició', es:'Posición', en:'Position' },
    'reg.th_number':    { ca:'Dorsal', es:'Dorsal', en:'Number' },
    'reg.status_none':  { ca:'Cap', es:'Ninguno', en:'None' },
    'reg.status_player':{ ca:'Jugador', es:'Jugador', en:'Player' },
    'reg.status_staff': { ca:'Staff', es:'Staff', en:'Staff' },
    'reg.status_both':  { ca:'Ambdós', es:'Ambos', en:'Both' },
    'reg.assigned':     { ca:'Membres assignats', es:'Miembros asignados', en:'Assigned registrations' },
    'reg.unassigned':   { ca:'Sense equip assignat', es:'Sin equipo asignado', en:'Unassigned registrations' },
    'reg.unassigned_desc':{ ca:'Membres del club que encara no estan en cap equip. Afegeix el seu correu a la llista de jugadors d\'un equip per assignar-los.', es:'Miembros del club que aún no están en ningún equipo. Añade su correo a la lista de jugadores de un equipo para asignarlos.', en:'Club members who are not in a squad yet. Add their address to a team\'s player list to assign them.' },
    'reg.unassigned_none':{ ca:'Tothom té equip assignat.', es:'Todos tienen equipo asignado.', en:'Everyone has a squad.' },
    'reg.th_prev_team': { ca:'Equip anterior', es:'Equipo anterior', en:'Previous team' },
    'reg.th_assign':    { ca:'Assignar a', es:'Asignar a', en:'Assign to' },
    'reg.assign':       { ca:'Assignar', es:'Asignar', en:'Assign' },
    'reg.pre_title':    { ca:'Jugadors pre-registrats', es:'Jugadores pre-registrados', en:'Pre-registered Players' },
    'reg.pre_desc':     { ca:'Afegeix el correu d\'un jugador i el seu equip. Només els correus afegits es podran registrar, i apareixeran a la llista de sota amb un punt taronja fins que ho facin.', es:'Añade el correo de un jugador y su equipo. Solo los correos añadidos podrán registrarse, y aparecerán en la lista de abajo con un punto naranja hasta que lo hagan.', en:'Add a player\'s email and their team. Only added addresses can register, and they appear in the list below with an orange dot until they do.' },
    'reg.pre_add':      { ca:'Afegir', es:'Añadir', en:'Add' },
    'reg.pre_pending':  { ca:'Pendent de registre', es:'Pendiente de registro', en:'Not registered yet' },
    'reg.pre_already_member':{ ca:'Aquest correu ja pertany a un membre amb equip assignat.', es:'Este correo ya pertenece a un miembro con equipo asignado.', en:'That address already belongs to a member with a squad.' },
    'reg.dot_registered':{ ca:'Registrat — ja té compte a l\'app', es:'Registrado — ya tiene cuenta en la app', en:'Registered — has an account' },
    'reg.dot_pending':  { ca:'Convidat — encara no s\'ha registrat', es:'Invitado — todavía no se ha registrado', en:'Invited — has not signed up yet' },
    'reg.pre_no_cat':   { ca:'Selecciona una categoria per gestionar-ne els jugadors.', es:'Selecciona una categoría para gestionar sus jugadores.', en:'Pick a category to manage its players.' },

    // ── Player Stats ──
    'stats.goals':     { ca:'Gols', es:'Goles', en:'Goals' },
    'stats.assists':   { ca:'Assistències', es:'Asistencias', en:'Assists' },
    'stats.matches':   { ca:'Partits', es:'Partidos', en:'Matches' },
    'stats.titular':   { ca:'Titular', es:'Titular', en:'Starter' },
    'stats.minutes':   { ca:'Minuts', es:'Minutos', en:'Minutes' },
    'stats.attendance':{ ca:'Assistència', es:'Asistencia', en:'Attendance' },
    'stats.injury_history':{ ca:'🏥 Historial de lesions', es:'🏥 Historial de lesiones', en:'🏥 Injury History' },
    'stats.no_injuries':   { ca:'Cap lesió aquesta temporada 💪', es:'Sin lesiones esta temporada 💪', en:'No injuries this season 💪' },
    'stats.present':       { ca:'Present', es:'Presente', en:'Present' },
    'stats.days_so_far':   { ca:'dies fins ara', es:'días hasta ahora', en:'days so far' },
    'stats.day_1':         { ca:'1 dia', es:'1 día', en:'1 day' },
    'stats.days_n':        { ca:'dies', es:'días', en:'days' },

    // ── Match History ──
    'mh.title':      { ca:'Historial de partits', es:'Historial de partidos', en:'Match History' },
    'mh.th_date':    { ca:'Data', es:'Fecha', en:'Date' },
    'mh.th_match':   { ca:'Partit', es:'Partido', en:'Match' },
    'mh.th_result':  { ca:'Res.', es:'Res.', en:'Res.' },
    'mh.no_matches': { ca:'Cap partit registrat', es:'Sin partidos registrados', en:'No matches recorded' },
    'mh.status_t':   { ca:'T', es:'T', en:'T' },
    'mh.status_s':   { ca:'S', es:'S', en:'S' },
    'mh.status_nc':  { ca:'NC', es:'NC', en:'NC' },
    'mh.result_v':   { ca:'V', es:'V', en:'W' },
    'mh.result_d':   { ca:'D', es:'D', en:'L' },
    'mh.result_e':   { ca:'E', es:'E', en:'D' },

    // ── Readiness ──
    'readiness.title':    { ca:'Preparació', es:'Preparación', en:'Readiness' },
    'readiness.no_data':  { ca:'Encara no hi ha prou dades', es:'Aún no hay suficientes datos', en:'Not enough data yet' },
    // Readiness is a training-LOAD score and never reads the injury log, so
    // an injured player can legitimately show a good one. This says so.
    'readiness.injured_warning': { ca:'Compte: jugador lesionat actualment', es:'Cuidado: jugador lesionado actualmente', en:'Careful — player currently injured' },
    // Why the dot is the colour it is. The colour comes from ACWR, risk
    // flags and overrides — not from the score — so it has to be said.
    'rd.acwr_high':     { ca:"Càrrega molt per sobre de l'habitual", es:'Carga muy por encima de lo habitual', en:'Load far above usual' },
    'rd.acwr_over':     { ca:"Càrrega per sobre de l'habitual", es:'Carga por encima de lo habitual', en:'Load above usual' },
    'rd.acwr_low':      { ca:"Càrrega per sota de l'habitual", es:'Carga por debajo de lo habitual', en:'Load below usual' },
    'rd.spike':         { ca:'Pujada brusca de càrrega aquesta setmana', es:'Subida brusca de carga esta semana', en:'Sharp load increase this week' },
    'rd.trend':         { ca:'RPE en augment les últimes setmanes', es:'RPE en aumento las últimas semanas', en:'RPE rising over recent weeks' },
    'rd.fatigue':       { ca:'Fatiga del darrer partit', es:'Fatiga del último partido', en:'Fatigue from the last match' },
    'rd.two_matches':   { ca:'Dos partits llargs en quatre dies', es:'Dos partidos largos en cuatro días', en:'Two long matches in four days' },
    'rd.hard_sessions': { ca:'Les dues últimes sessions molt exigents', es:'Las dos últimas sesiones muy exigentes', en:'Last two sessions very hard' },
    'rd.low_score':     { ca:'Puntuació global baixa', es:'Puntuación global baja', en:'Low overall score' },
    'rd.estimated':     { ca:'Inclou càrrega estimada (no ha reportat RPE)', es:'Incluye carga estimada (no ha reportado RPE)', en:'Includes estimated load (no RPE reported)' },
    'readiness.good':     { ca:'Bé', es:'Bien', en:'Good' },
    'readiness.moderate': { ca:'Moderat', es:'Moderado', en:'Moderate' },
    'readiness.low':      { ca:'Baix', es:'Bajo', en:'Low' },
    'readiness.acwr':     { ca:'ACWR', es:'ACWR', en:'ACWR' },
    'readiness.load_ratio':   { ca:'Ràtio de càrrega', es:'Ratio de carga', en:'Load Ratio' },
    'readiness.match_fatigue':{ ca:'Fatiga de partit', es:'Fatiga de partido', en:'Match Fatigue' },
    'readiness.load_spike':   { ca:'Pic de càrrega', es:'Pico de carga', en:'Load Spike' },
    'readiness.rpe_trend':    { ca:'Tendència RPE', es:'Tendencia RPE', en:'RPE Trend' },

    // ── Tactical Board ──
    'tactics.formation':     { ca:'Formació', es:'Formación', en:'Formation' },
    'tactics.select_formation':{ ca:'— Selecciona —', es:'— Seleccionar —', en:'— Select —' },
    'tactics.opp':           { ca:'Riv', es:'Riv', en:'Opp' },
    'tactics.dash':          { ca:'Disc.', es:'Disc.', en:'Dash' },
    'tactics.new_board':     { ca:'Nova pissarra', es:'Nueva pizarra', en:'New Board' },
    'tactics.board_name_ph': { ca:'Nom de la pissarra…', es:'Nombre de la pizarra…', en:'Board name…' },
    'tactics.saved_boards':  { ca:'Pissarres desades', es:'Pizarras guardadas', en:'Saved Boards' },
    'tactics.frames':        { ca:'Fotogrames', es:'Fotogramas', en:'Frames' },
    'tactics.tag':           { ca:'Etiqueta', es:'Etiqueta', en:'Tag' },
    'tactics.tag_none':      { ca:'— Cap —', es:'— Ninguna —', en:'— None —' },
    'tactics.tag_new_ph':    { ca:'Nova etiqueta...', es:'Nueva etiqueta...', en:'New tag...' },
    'tactics.add_to_match':  { ca:'Afegir a partit', es:'Añadir a partido', en:'Add to Match' },
    'tactics.add_to_training':{ ca:'Afegir a entrenament', es:'Añadir a entrenamiento', en:'Add to Training' },
    'tactics.match_none':    { ca:'Cap', es:'Ninguno', en:'None' },

    // ── Context Menu ──
    'ctx.add_player':    { ca:'Afegir jugador', es:'Añadir jugador', en:'Add player' },
    'ctx.add_opponent':  { ca:'Afegir rival', es:'Añadir rival', en:'Add opponent' },
    'ctx.add_ball':      { ca:'Afegir pilota', es:'Añadir balón', en:'Add ball' },
    'ctx.copy':          { ca:'Copiar', es:'Copiar', en:'Copy' },
    'ctx.duplicate':     { ca:'Duplicar', es:'Duplicar', en:'Duplicate' },
    'ctx.paste':         { ca:'Enganxar', es:'Pegar', en:'Paste' },
    'ctx.delete':        { ca:'Eliminar', es:'Eliminar', en:'Delete' },
    'ctx.delete_arrow':  { ca:'Eliminar fletxa', es:'Eliminar flecha', en:'Delete arrow' },
    'ctx.delete_pen':    { ca:'Eliminar línia', es:'Eliminar línea', en:'Delete pen line' },
    'ctx.delete_rect':   { ca:'Eliminar rectangle', es:'Eliminar rectángulo', en:'Delete rectangle' },
    'ctx.delete_ball':   { ca:'Eliminar pilota', es:'Eliminar balón', en:'Delete ball' },
    'ctx.delete_cone':   { ca:'Eliminar con', es:'Eliminar cono', en:'Delete cone' },
    'ctx.edit_text':     { ca:'Editar text', es:'Editar texto', en:'Edit text' },
    'ctx.size':          { ca:'Mida', es:'Tamaño', en:'Size' },

    // ── TB Confirm Modals ──
    'tb.new_title':   { ca:'Nova pissarra', es:'Nueva pizarra', en:'New Board' },
    'tb.new_msg':     { ca:'Tens canvis sense desar. Crear una pissarra nova?', es:'Tienes cambios sin guardar. ¿Crear una pizarra nueva?', en:'You have unsaved changes. Start a new board?' },
    'tb.load_title':  { ca:'Carregar pissarra', es:'Cargar pizarra', en:'Load Board' },
    'tb.load_msg':    { ca:'Tens canvis sense desar. Descartar-los i carregar?', es:'Tienes cambios sin guardar. ¿Descartarlos y cargar?', en:'You have unsaved changes. Discard them and load this board?' },
    'tb.delete_title':{ ca:'Eliminar pissarra', es:'Eliminar pizarra', en:'Delete Board' },
    'tb.delete_msg':  { ca:'Eliminar aquesta pissarra desada?', es:'¿Eliminar esta pizarra guardada?', en:'Remove this saved board?' },
    'tb.saved':       { ca:'Desat ✓', es:'Guardado ✓', en:'Saved ✓' },
    'tb.added':       { ca:'Afegit ✓', es:'Añadido ✓', en:'Added ✓' },

    // ── Medical ──
    'medical.log_injury':    { ca:'+ Registrar lesió', es:'+ Registrar lesión', en:'+ Log Injury' },
    'medical.injured':       { ca:'Lesionat', es:'Lesionado', en:'Injured' },
    'medical.recovering':    { ca:'Recuperant-se', es:'Recuperándose', en:'Recovering' },
    'medical.total_season':  { ca:'Total aquesta temporada', es:'Total esta temporada', en:'Total This Season' },
    'medical.avg_recovery':  { ca:'Recuperació mitjana', es:'Recuperación media', en:'Avg Recovery' },
    'medical.squad_fitness': { ca:'Estat físic de l\'equip', es:'Estado físico del equipo', en:'Squad Fitness' },
    'medical.filter_all':    { ca:'Tots', es:'Todos', en:'All' },
    'medical.filter_injured':{ ca:'Lesionats', es:'Lesionados', en:'Injured' },
    'medical.filter_recovering':{ ca:'Recuperant-se', es:'Recuperándose', en:'Recovering' },
    'medical.filter_fit':    { ca:'Apte', es:'Apto', en:'Fit' },
    'medical.active':        { ca:'🏥 Lesions actives', es:'🏥 Lesiones activas', en:'🏥 Active Injuries' },
    'medical.past':          { ca:'📋 Lesions passades', es:'📋 Lesiones pasadas', en:'📋 Past Injuries' },
    'medical.no_active':     { ca:'Cap lesió activa', es:'Sin lesiones activas', en:'No active injuries' },
    'medical.no_past':       { ca:'Cap lesió passada aquesta temporada', es:'Sin lesiones pasadas esta temporada', en:'No past injuries this season' },
    'medical.self_reported': { ca:'Reportada pel jugador', es:'Reportada por el jugador', en:'Reported by the player' },
    'medical.not_logged':    { ca:'Sense fitxa de lesió', es:'Sin ficha de lesión', en:'No injury record yet' },
    'medical.discard':       { ca:'Descartar', es:'Descartar', en:'Discard' },
    'medical.severity_minor':   { ca:'Lleu', es:'Leve', en:'Minor' },
    'medical.severity_moderate':{ ca:'Moderada', es:'Moderada', en:'Moderate' },
    'medical.severity_severe':  { ca:'Greu', es:'Grave', en:'Severe' },
    'medical.status_fit':       { ca:'Apte', es:'Apto', en:'Fit' },
    'medical.status_injured':   { ca:'Lesionat', es:'Lesionado', en:'Injured' },
    'medical.status_recovering':{ ca:'Recuperant-se', es:'Recuperándose', en:'Recovering' },
    'medical.status_active':    { ca:'Actiu', es:'Activo', en:'Active' },
    'medical.status_resolved':  { ca:'Resolt', es:'Resuelto', en:'Resolved' },
    'medical.mark_recovering':  { ca:'Marcar recuperant-se', es:'Marcar recuperándose', en:'Mark Recovering' },
    'medical.mark_resolved':    { ca:'Marcar resolt', es:'Marcar resuelto', en:'Mark Resolved' },
    'medical.since':            { ca:'Des de', es:'Desde', en:'Since' },
    'medical.today':            { ca:'Avui', es:'Hoy', en:'Today' },
    'medical.due_back':         { ca:'Tornada prevista', es:'Vuelta prevista', en:'Due back' },
    'medical.days_to_return':   { ca:'d per tornar', es:'d para volver', en:'d to return' },

    // ── Medical Detail ──
    'med_detail.back':          { ca:'← Mèdic', es:'← Médico', en:'← Medical' },
    'med_detail.current':       { ca:'Lesió actual', es:'Lesión actual', en:'Current Injury' },
    'med_detail.expected':      { ca:'Tornada prevista:', es:'Vuelta prevista:', en:'Expected return:' },
    'med_detail.injury_map':    { ca:'Mapa de lesions', es:'Mapa de lesiones', en:'Injury Map' },
    'med_detail.timeline':      { ca:'Historial de lesions', es:'Historial de lesiones', en:'Injury Timeline' },
    'med_detail.no_history':    { ca:'Cap historial de lesions', es:'Sin historial de lesiones', en:'No injury history' },
    'med_detail.recurring':     { ca:'⚠️ Recurrent:', es:'⚠️ Recurrente:', en:'⚠️ Recurring:' },
    'med_detail.injuries_count':{ ca:'lesions', es:'lesiones', en:'injuries' },

    // ── Injury Logger ──
    'injury_log.title':      { ca:'🏥 Registrar lesió', es:'🏥 Registrar lesión', en:'🏥 Log Injury' },
    'injury_log.edit_title': { ca:'✏️ Editar lesió', es:'✏️ Editar lesión', en:'✏️ Edit Injury' },
    'injury_log.player':     { ca:'Jugador', es:'Jugador', en:'Player' },
    'injury_log.select_ph':  { ca:'Selecciona jugador…', es:'Selecciona jugador…', en:'Select player…' },
    'injury_log.area':       { ca:'Zona lesionada (toca el mapa)', es:'Zona lesionada (toca el mapa)', en:'Injured Area (tap body map)' },
    'injury_log.general':    { ca:'— General —', es:'— General —', en:'— General —' },
    'injury_log.describe_ph':{ ca:'Descriu la lesió…', es:'Describe la lesión…', en:'Describe injury…' },
    'injury_log.severity':   { ca:'Gravetat', es:'Gravedad', en:'Severity' },
    'injury_log.start_date': { ca:'Data d\'inici', es:'Fecha de inicio', en:'Start Date' },
    'injury_log.expected':   { ca:'Tornada prevista', es:'Vuelta prevista', en:'Expected Return' },
    'injury_log.notes':      { ca:'Notes', es:'Notas', en:'Notes' },
    'injury_log.notes_ph':   { ca:'Notes addicionals…', es:'Notas adicionales…', en:'Additional notes…' },
    'injury_log.save':       { ca:'Desar lesió', es:'Guardar lesión', en:'Save Injury' },
    'injury_log.status':     { ca:'Estat', es:'Estado', en:'Status' },
    'injury_log.end_date':   { ca:'Data de fi', es:'Fecha de fin', en:'End Date' },

    // ── Notifications ──
    'notif.all':         { ca:'Totes les notificacions', es:'Todas las notificaciones', en:'All Notifications' },
    'notif.no_notif':    { ca:'Cap notificació.', es:'Sin notificaciones.', en:'No notifications yet.' },
    'notif.training_rpe':{ ca:'RPE Entrenament', es:'RPE Entrenamiento', en:'Training RPE' },
    'notif.match_rpe':   { ca:'RPE Partit', es:'RPE Partido', en:'Match RPE' },
    'notif.extra':       { ca:'Entrenament extra', es:'Entrenamiento extra', en:'Extra Training' },
    'notif.train_avail': { ca:'Disp. Entrenament', es:'Disp. Entrenamiento', en:'Training Avail' },
    'notif.match_avail': { ca:'Disp. Partit', es:'Disp. Partido', en:'Match Avail' },



    // ── Settings ──
    'settings.cat_config':   { ca:'Configuració de categories', es:'Configuración de categorías', en:'Category Configuration' },
    'settings.cat_edit_desc':{ ca:'Modifica les categories, equips i enllaços classificació FCF del club.', es:'Modifica las categorías, equipos y enlaces clasificación FCF del club.', en:'Edit your club\'s categories, teams and FCF league links.' },
    'settings.cat_no_club':  { ca:'No estàs vinculat a cap club. Contacta l\'administrador.', es:'No estás vinculado a ningún club. Contacta al administrador.', en:'You are not linked to any club. Contact the administrator.' },
    'settings.cat_edit_btn': { ca:'Editar categories', es:'Editar categorías', en:'Edit categories' },
    'settings.club_mgmt':   { ca:'Gestió de clubs', es:'Gestión de clubes', en:'Club Management' },
    'settings.loading':      { ca:'Carregant clubs…', es:'Cargando clubes…', en:'Loading clubs…' },
    'settings.no_clubs':     { ca:'Cap club creat encara.', es:'Ningún club creado todavía.', en:'No clubs created yet.' },
    'settings.error_loading':{ ca:'Error carregant clubs.', es:'Error cargando clubes.', en:'Error loading clubs.' },
    'settings.create_club':  { ca:'Crear nou club', es:'Crear nuevo club', en:'Create New Club' },
    'settings.club_name':    { ca:'Nom del club', es:'Nombre del club', en:'Club Name' },
    'settings.club_name_ph': { ca:'CF Exemple', es:'CF Ejemplo', en:'FC Example' },
    'settings.club_email':   { ca:'Email del Team Lead', es:'Email del Team Lead', en:'Team Lead Email' },
    'settings.club_badge':   { ca:'Escut del club (PNG)', es:'Escudo del club (PNG)', en:'Club Badge (PNG)' },
    'settings.create_btn':   { ca:'Crear club', es:'Crear club', en:'Create Club' },
    'settings.th_club':      { ca:'Club', es:'Club', en:'Club' },
    'settings.th_code':      { ca:'Codi', es:'Código', en:'Code' },
    'settings.th_teamlead':  { ca:'Team Lead', es:'Team Lead', en:'Team Lead' },
    'settings.copy_code':    { ca:'Copiar codi', es:'Copiar código', en:'Copy code' },
    'settings.data_mgmt':    { ca:'Gestió de dades', es:'Gestión de datos', en:'Data Management' },
    'settings.reset_desc':   { ca:'Reseteja totes les dades per començar de nou. Això eliminarà tots els usuaris i restaurarà les dades d\'exemple.', es:'Reinicia todos los datos para empezar de nuevo. Esto eliminará todos los usuarios y restaurará los datos de ejemplo.', en:'Reset all app data to start fresh. This will remove all users and restore sample data.' },
    'settings.reset_btn':    { ca:'Resetejar totes les dades', es:'Reiniciar todos los datos', en:'Reset All Data' },
    'settings.new_season':   { ca:'Nova Temporada', es:'Nueva Temporada', en:'New Season' },
    'settings.new_season_desc': { ca:'Arxiva totes les dades de la temporada actual i comença de zero. Els jugadors, staff i pissarres tàctiques es mantenen.', es:'Archiva todos los datos de la temporada actual y empieza de cero. Los jugadores, staff y pizarras tácticas se mantienen.', en:'Archive all current season data and start fresh. Players, staff and tactical boards are preserved.' },
    'settings.new_season_btn':  { ca:'Iniciar Nova Temporada', es:'Iniciar Nueva Temporada', en:'Start New Season' },
    'settings.archived_seasons': { ca:'Temporades Arxivades', es:'Temporadas Archivadas', en:'Archived Seasons' },
    'settings.archived_seasons_desc': { ca:'Consulta les dades de temporades anteriors.', es:'Consulta los datos de temporadas anteriores.', en:'View data from previous seasons.' },

    // ── Archive Viewer ──
    'archive.title':          { ca:'Temporades Arxivades', es:'Temporadas Archivadas', en:'Archived Seasons' },
    'archive.no_seasons':     { ca:'No hi ha temporades arxivades.', es:'No hay temporadas archivadas.', en:'No archived seasons.' },
    'archive.archived_on':    { ca:'Arxivada el', es:'Archivada el', en:'Archived on' },
    'archive.view':           { ca:'Veure', es:'Ver', en:'View' },
    'archive.matches':        { ca:'Partits', es:'Partidos', en:'Matches' },
    'archive.stats':          { ca:'Estadístiques', es:'Estadísticas', en:'Stats' },
    'archive.attendance':     { ca:'Assistència', es:'Asistencia', en:'Attendance' },
    'archive.injuries':       { ca:'Lesions', es:'Lesiones', en:'Injuries' },
    'archive.season_summary': { ca:'Resum de la Temporada', es:'Resumen de la Temporada', en:'Season Summary' },
    'archive.goals_for':      { ca:'Gols a favor', es:'Goles a favor', en:'Goals for' },
    'archive.goals_against':  { ca:'Gols en contra', es:'Goles en contra', en:'Goals against' },
    'archive.wins':           { ca:'Victòries', es:'Victorias', en:'Wins' },
    'archive.draws':          { ca:'Empats', es:'Empates', en:'Draws' },
    'archive.losses':         { ca:'Derrotes', es:'Derrotas', en:'Losses' },
    'archive.trainings':      { ca:'Entrenaments', es:'Entrenamientos', en:'Trainings' },
    'archive.players':        { ca:'Jugadors', es:'Jugadores', en:'Players' },
    'archive.avg_attendance': { ca:'Assistència mitjana', es:'Asistencia media', en:'Avg. attendance' },
    'archive.days_out':       { ca:'Dies fora', es:'Días fuera', en:'Days out' },
    'archive.total_injuries': { ca:'Total lesions', es:'Total lesiones', en:'Total injuries' },
    'archive.total_days_lost':{ ca:'Dies totals perduts', es:'Días totales perdidos', en:'Total days lost' },
    'archive.present':        { ca:'Present', es:'Presente', en:'Present' },
    'archive.late':           { ca:'Tard', es:'Tarde', en:'Late' },
    'archive.absent':         { ca:'Absent', es:'Ausente', en:'Absent' },
    'archive.loading':        { ca:'Carregant…', es:'Cargando…', en:'Loading…' },

    // ── Confirm / Alert Messages ──
    'alert.image_too_large':  { ca:'La imatge ha de ser inferior a 2 MB.', es:'La imagen debe ser inferior a 2 MB.', en:'Image must be under 2 MB.' },
    'alert.select_role':      { ca:'Selecciona almenys un rol.', es:'Selecciona al menos un rol.', en:'Please select at least one role.' },
    'alert.board_name_exists':{ ca:'Ja existeix una pissarra amb aquest nom.', es:'Ya existe una pizarra con ese nombre.', en:'A board with this name already exists.' },
    'alert.select_training':  { ca:'Selecciona un entrenament.', es:'Selecciona un entrenamiento.', en:'Please select a training.' },
    'alert.select_match':     { ca:'Selecciona un partit.', es:'Selecciona un partido.', en:'Please select a match.' },
    'alert.select_player':    { ca:'Selecciona un jugador.', es:'Selecciona un jugador.', en:'Please select a player.' },
    'confirm.existing_injury':{ ca:'Aquest jugador ja té una lesió activa. Crear-ne una de nova?', es:'Este jugador ya tiene una lesión activa. ¿Crear una nueva?', en:'This player already has an active injury. Create a new one?' },
    'confirm.discard_injury':{ ca:'Descartar aquesta lesió? El jugador passarà a estar apte. Si torna a reportar-se lesionat més endavant, hi tornarà a aparèixer.', es:'¿Descartar esta lesión? El jugador pasará a estar apto. Si vuelve a reportarse lesionado más adelante, volverá a aparecer.', en:'Discard this injury? The player goes back to fit. If he reports himself injured again later, it will reappear.' },
    'confirm.erase_title':   { ca:'Esborrar definitivament', es:'Borrar definitivamente', en:'Delete permanently' },
    'confirm.erase_msg':     { ca:'S\'esborrarà el compte de {name} i TOTES les seves dades: assistències, RPE, lesions, convocatòries, notificacions i la foto de perfil. No es pot desfer.\n\nEscriu el seu nom per confirmar:', es:'Se borrará la cuenta de {name} y TODOS sus datos: asistencias, RPE, lesiones, convocatorias, notificaciones y la foto de perfil. No se puede deshacer.\n\nEscribe su nombre para confirmar:', en:'This deletes {name}\'s account and ALL their data: attendance, RPE, injuries, call-ups, notifications and profile photo. It cannot be undone.\n\nType their name to confirm:' },
    'confirm.erase_kept':    { ca:'Es conserven: les temporades arxivades i el seu nom als esdeveniments dels partits, perquè els resultats segueixin quadrant.', es:'Se conservan: las temporadas archivadas y su nombre en los eventos de los partidos, para que los resultados sigan cuadrando.', en:'Kept: archived seasons, and their name on match events so scorelines still add up.' },
    'confirm.leave_squad_title':{ ca:'Treure de l\'equip', es:'Quitar del equipo', en:'Remove from squad' },
    'confirm.leave_squad_msg':{ ca:'{name} sortirà d\'aquest equip però continuarà al club, amb tot el seu històric intacte (assistències, RPE, lesions). Quan un altre entrenador afegeixi el seu correu, hi tornarà amb totes les dades.', es:'{name} saldrá de este equipo pero seguirá en el club, con todo su histórico intacto (asistencias, RPE, lesiones). Cuando otro entrenador añada su correo, volverá con todos sus datos.', en:'{name} leaves this squad but stays in the club, with all their history intact (attendance, RPE, injuries). When another coach adds their email, they come back with everything.' },
    'confirm.delete_user':    { ca:'Eliminar aquest usuari?', es:'¿Eliminar este usuario?', en:'Delete this user?' },
    'confirm.erase_all':      { ca:'Això esborrarà TOTES les dades. Estàs segur?', es:'Esto borrará TODOS los datos. ¿Estás seguro?', en:'This will erase ALL data. Are you sure?' },
    'save.sync_title':        { ca:'Sincronització', es:'Sincronización', en:'Sync' },
    'save.queued':            { ca:'Guardat al dispositiu — pendent de sincronitzar. No tanquis l\'app fins que tinguis connexió.', es:'Guardado en el dispositivo — pendiente de sincronizar. No cierres la app hasta tener conexión.', en:'Saved on device — pending sync. Keep the app open until you are back online.' },
    'save.error':             { ca:'Error desant les dades. Revisa la connexió i torna-ho a provar.', es:'Error guardando los datos. Revisa la conexión y vuelve a intentarlo.', en:'Error saving data. Check your connection and try again.' },
    'save.error_perms':       { ca:'No s\'ha pogut desar (permisos). Torna a iniciar sessió.', es:'No se ha podido guardar (permisos). Vuelve a iniciar sesión.', en:'Could not save (permissions). Please sign in again.' },
    'confirm.delete_match':   { ca:'Eliminar aquest partit?', es:'¿Eliminar este partido?', en:'Delete this match?' },
    'confirm.new_season_title': { ca:'Nova Temporada', es:'Nueva Temporada', en:'New Season' },
    'confirm.new_season_msg':   { ca:'Això arxivarà TOTES les dades de la temporada actual (partits, entrenaments, RPE, estadístiques…) i començarà de zero.\n\nEls jugadors, staff i pissarres tàctiques es mantindran.\n\nAquesta acció NO es pot desfer.', es:'Esto archivará TODOS los datos de la temporada actual (partidos, entrenamientos, RPE, estadísticas…) y empezará de cero.\n\nLos jugadores, staff y pizarras tácticas se mantendrán.\n\nEsta acción NO se puede deshacer.', en:'This will archive ALL current season data (matches, training, RPE, stats…) and start fresh.\n\nPlayers, staff and tactical boards will be preserved.\n\nThis action CANNOT be undone.' },
    'confirm.new_season_label': { ca:'Etiqueta de la temporada (p.ex. 2025-2026):', es:'Etiqueta de la temporada (ej. 2025-2026):', en:'Season label (e.g. 2025-2026):' },
    'confirm.new_season_step2': { ca:'Escriu NOVA TEMPORADA per confirmar:', es:'Escribe NUEVA TEMPORADA para confirmar:', en:'Type NEW SEASON to confirm:' },
    'confirm.new_season_phrase':{ ca:'NOVA TEMPORADA', es:'NUEVA TEMPORADA', en:'NEW SEASON' },
    'alert.new_season_ok':      { ca:'Temporada arxivada correctament. S\'ha iniciat una nova temporada!', es:'Temporada archivada correctamente. ¡Se ha iniciado una nueva temporada!', en:'Season archived successfully. A new season has started!' },
    'alert.new_season_fail':    { ca:'Error arxivant la temporada. Torna-ho a provar.', es:'Error archivando la temporada. Inténtalo de nuevo.', en:'Error archiving the season. Please try again.' },
    'alert.new_season_archiving': { ca:'Arxivant temporada…', es:'Archivando temporada…', en:'Archiving season…' },
    'alert.erase_done':      { ca:'{name} esborrat. {records} registres eliminats.', es:'{name} borrado. {records} registros eliminados.', en:'{name} deleted. {records} records removed.' },
    'error.passwords_mismatch':{ ca:'Les contrasenyes no coincideixen.', es:'Las contraseñas no coinciden.', en:'Passwords do not match.' },
    'error.invalid_team_code': { ca:'Codi d\'equip no vàlid.', es:'Código de equipo no válido.', en:'Invalid team code.' },
    'error.need_team_code':    { ca:'Has d\'introduir el codi d\'equip.', es:'Debes introducir el código de equipo.', en:'You must enter a team code.' },
    'error.enter_code':        { ca:'Introdueix un codi.', es:'Introduce un código.', en:'Enter a code.' },
    'error.invalid_code':      { ca:'Codi no vàlid.', es:'Código no válido.', en:'Invalid code.' },
    'error.need_category':     { ca:'Has d\'activar almenys una categoria.', es:'Debes activar al menos una categoría.', en:'You must enable at least one category.' },
    'error.no_categories':     { ca:'Encara no tens cap categoria assignada. Contacta el responsable del club.', es:'Todavía no tienes ninguna categoría asignada. Contacta con el responsable del club.', en:'You have no category assigned yet. Contact your club lead.' },
    'error.invalid_email':     { ca:'Adreça de correu no vàlida.', es:'Dirección de correo no válida.', en:'Invalid email address.' },
    'error.duplicate_email':   { ca:'Aquest correu ja és a la llista.', es:'Este correo ya está en la lista.', en:'That email is already on the list.' },
    'error.role_change_denied':{ ca:'Només el responsable del club pot canviar rols.', es:'Solo el responsable del club puede cambiar roles.', en:'Only the club lead can change roles.' },

    // ── Empty States ──
    'empty.page_not_found':  { ca:'Pàgina no trobada', es:'Página no encontrada', en:'Page not found' },

    // ── Fitness ──
    'fitness.fit':           { ca:'Apte', es:'Apto', en:'Fit' },
    'fitness.doubt':         { ca:'Dubte', es:'Duda', en:'Doubt' },
    'fitness.injured':       { ca:'Lesionat', es:'Lesionado', en:'Injured' },
    'fitness.recovering':    { ca:'Recuperant-se de', es:'Recuperándose de', en:'Recovering from' },
    'fitness.injury':        { ca:'Lesió', es:'Lesión', en:'Injury' },

    // ── Auth (login/register/join) ──
    'auth.subtitle':         { ca:'Benvingut al millor club del barri', es:'Bienvenido al mejor club del barrio', en:'Welcome to the best club in town' },
    'auth.email':            { ca:'Email', es:'Email', en:'Email' },
    'auth.password':         { ca:'Contrasenya', es:'Contraseña', en:'Password' },
    'auth.password_ph':      { ca:'Mínim 6 caràcters', es:'Mínimo 6 caracteres', en:'Min. 6 characters' },
    'auth.login_btn':        { ca:'A jugar!', es:'¡A jugar!', en:'Let\'s play!' },
    'auth.no_account':       { ca:'No tens un perfil?', es:'¿No tienes perfil?', en:'Don\'t have an account?' },
    'auth.register_link':    { ca:'Fes-te\'l!', es:'¡Créalo!', en:'Sign up!' },
    'auth.register_subtitle':{ ca:'Ets a punt de fer història', es:'Estás a punto de hacer historia', en:'You\'re about to make history' },
    'auth.name':             { ca:'Nom', es:'Nombre', en:'Name' },
    'auth.confirm_password': { ca:'Confirma contrasenya', es:'Confirma contraseña', en:'Confirm Password' },
    'auth.team_code':        { ca:'Codi d\'equip', es:'Código de equipo', en:'Team Code' },
    'auth.register_btn':     { ca:'Crea perfil', es:'Crear perfil', en:'Create Account' },
    'auth.has_account':      { ca:'Ja tens un perfil?', es:'¿Ya tienes perfil?', en:'Already have an account?' },
    'auth.login_link':       { ca:'Entra', es:'Entrar', en:'Sign in' },
    'auth.join_title':       { ca:'Uneix-te a un equip', es:'Únete a un equipo', en:'Join a Team' },
    'auth.join_subtitle':    { ca:'Introdueix el codi que t\'ha donat el teu club', es:'Introduce el código que te ha dado tu club', en:'Enter the code your club gave you' },
    'auth.join_btn':         { ca:'Unir-me', es:'Unirme', en:'Join' },
    'auth.logout':           { ca:'Tancar sessió', es:'Cerrar sesión', en:'Logout' },
    'auth.setup_title':      { ca:'Configura el teu club', es:'Configura tu club', en:'Set up your club' },
    'auth.setup_subtitle':   { ca:'Activa les categories i equips del teu club', es:'Activa las categorías y equipos de tu club', en:'Enable your club\'s categories and teams' },
    'auth.fcf_title':        { ca:'Enllaços classificació FCF', es:'Enlaces clasificación FCF', en:'FCF League Links' },
    'auth.fcf_optional':     { ca:'(opcional)', es:'(opcional)', en:'(optional)' },
    'auth.schedules_title':  { ca:'Horaris per defecte', es:'Horarios por defecto', en:'Default Schedules' },
    'auth.staff_title':      { ca:'Staff per equip', es:'Staff por equipo', en:'Staff per Team' },
    'auth.staff_desc':       { ca:'Els correus que afegeixis aquí podran registrar-se com a staff d\'aquesta categoria.', es:'Los correos que añadas aquí podrán registrarse como staff de esta categoría.', en:'Addresses added here may register as staff for this category.' },
    'auth.staff_add':        { ca:'+ Staff', es:'+ Staff', en:'+ Staff' },
    'auth.email_ph':         { ca:'correu@exemple.com', es:'correo@ejemplo.com', en:'email@example.com' },
    'auth.save_continue':    { ca:'Desar i continuar', es:'Guardar y continuar', en:'Save & Continue' },
    'auth.profile_title':    { ca:'Benvingut!', es:'¡Bienvenido!', en:'Welcome!' },
    'auth.profile_subtitle': { ca:'Configura el teu perfil per començar', es:'Configura tu perfil para empezar', en:'Set up your profile to get started' },
    'auth.upload_photo':     { ca:'Pujar foto', es:'Subir foto', en:'Upload Photo' },
    'auth.display_name':     { ca:'Nom', es:'Nombre', en:'Display Name' },
    'auth.display_name_ph':  { ca:'El teu nom', es:'Tu nombre', en:'Your name' },
    'auth.dob':              { ca:'Data de naixement', es:'Fecha de nacimiento', en:'Date of Birth' },
    'auth.continue':         { ca:'Continuar', es:'Continuar', en:'Continue' },
    'auth.roles_title':      { ca:'Tria el teu rol', es:'Elige tu rol', en:'Choose Your Role' },
    'auth.roles_subtitle':   { ca:'Selecciona com vols fer servir EsquerrApp', es:'Selecciona cómo quieres usar EsquerrApp', en:'Select how you want to use EsquerrApp' },
    'auth.role_player':      { ca:'Jugador', es:'Jugador', en:'Player' },
    'auth.role_player_desc': { ca:'Consulta el teu calendari d\'entrenaments, segueix les teves estadístiques i mira la plantilla.', es:'Consulta tu calendario de entrenamientos, sigue tus estadísticas y mira la plantilla.', en:'View your training schedule, track personal stats, and see the team roster.' },
    'auth.role_lead':        { ca:'Responsable del club', es:'Responsable del club', en:'Club Manager' },
    'auth.role_lead_desc':   { ca:'Configura categories, equips, horaris i el staff del club.', es:'Configura categorías, equipos, horarios y el staff del club.', en:'Set up the club\'s categories, teams, schedules and staff.' },
    'auth.role_granted':     { ca:'Assignat', es:'Asignado', en:'Granted' },
    'auth.roles_lead_subtitle':{ ca:'Ets el responsable del club. Tria també si vols ser jugador, staff, o cap dels dos.', es:'Eres el responsable del club. Elige también si quieres ser jugador, staff, o ninguno de los dos.', en:'You manage the club. Also choose whether you play, coach, or neither.' },
    'auth.roles_lead_hint':  { ca:'Deixa els dos desactivats si només vols gestionar el club.', es:'Deja los dos desactivados si solo quieres gestionar el club.', en:'Leave both off if you only want to manage the club.' },
    'auth.role_staff':       { ca:'Staff', es:'Staff', en:'Staff' },
    'auth.role_staff_desc':  { ca:'Gestiona entrenaments, revisa estadístiques i planifica la tàctica dels partits.', es:'Gestiona entrenamientos, revisa estadísticas y planifica la táctica de los partidos.', en:'Manage training sessions, review player stats, and plan match tactics.' },
    'auth.select':           { ca:'Seleccionar', es:'Seleccionar', en:'Select' },
    'auth.enable':           { ca:'Activar', es:'Activar', en:'Enable' },
    'auth.continue_dashboard':{ ca:'Continuar al panell', es:'Continuar al panel', en:'Continue to Dashboard' },
    'auth.roles_admin_subtitle':{ ca:'Com a admin, pots activar un o ambdós rols', es:'Como admin, puedes activar uno o ambos roles', en:'As admin, you can enable one or both roles for yourself' },
    'auth.saving':           { ca:'Desant…', es:'Guardando…', en:'Saving…' },

    // ── Category bar ──
    'cat.all':  { ca:'Totes', es:'Todas', en:'All' },

    // ── Date Picker months ──
    'month.0':  { ca:'Gener', es:'Enero', en:'January' },
    'month.1':  { ca:'Febrer', es:'Febrero', en:'February' },
    'month.2':  { ca:'Març', es:'Marzo', en:'March' },
    'month.3':  { ca:'Abril', es:'Abril', en:'April' },
    'month.4':  { ca:'Maig', es:'Mayo', en:'May' },
    'month.5':  { ca:'Juny', es:'Junio', en:'June' },
    'month.6':  { ca:'Juliol', es:'Julio', en:'July' },
    'month.7':  { ca:'Agost', es:'Agosto', en:'August' },
    'month.8':  { ca:'Setembre', es:'Septiembre', en:'September' },
    'month.9':  { ca:'Octubre', es:'Octubre', en:'October' },
    'month.10': { ca:'Novembre', es:'Noviembre', en:'November' },
    'month.11': { ca:'Desembre', es:'Diciembre', en:'December' },

    // ── Date Picker short days (Mon-first) ──
    'dpday.0':  { ca:'Dl', es:'Lu', en:'Mo' },
    'dpday.1':  { ca:'Dt', es:'Ma', en:'Tu' },
    'dpday.2':  { ca:'Dc', es:'Mi', en:'We' },
    'dpday.3':  { ca:'Dj', es:'Ju', en:'Th' },
    'dpday.4':  { ca:'Dv', es:'Vi', en:'Fr' },
    'dpday.5':  { ca:'Ds', es:'Sá', en:'Sa' },
    'dpday.6':  { ca:'Dg', es:'Do', en:'Su' },

    // ── Day labels (Monday-first for schedules) ──
    'day.monday':    { ca:'Dilluns', es:'Lunes', en:'Monday' },
    'day.tuesday':   { ca:'Dimarts', es:'Martes', en:'Tuesday' },
    'day.wednesday': { ca:'Dimecres', es:'Miércoles', en:'Wednesday' },
    'day.thursday':  { ca:'Dijous', es:'Jueves', en:'Thursday' },
    'day.friday':    { ca:'Divendres', es:'Viernes', en:'Friday' },
    'day.saturday':  { ca:'Dissabte', es:'Sábado', en:'Saturday' },
    'day.sunday':    { ca:'Diumenge', es:'Domingo', en:'Sunday' },

    // ── Full day names (Sunday=0 index) ──
    'dayFull.0':  { ca:'Diumenge', es:'Domingo', en:'Sunday' },
    'dayFull.1':  { ca:'Dilluns', es:'Lunes', en:'Monday' },
    'dayFull.2':  { ca:'Dimarts', es:'Martes', en:'Tuesday' },
    'dayFull.3':  { ca:'Dimecres', es:'Miércoles', en:'Wednesday' },
    'dayFull.4':  { ca:'Dijous', es:'Jueves', en:'Thursday' },
    'dayFull.5':  { ca:'Divendres', es:'Viernes', en:'Friday' },
    'dayFull.6':  { ca:'Dissabte', es:'Sábado', en:'Saturday' },

    // ── Short day names (Sunday=0) ──
    'dayShort.0': { ca:'Dg', es:'Do', en:'Sun' },
    'dayShort.1': { ca:'Dl', es:'Lu', en:'Mon' },
    'dayShort.2': { ca:'Dt', es:'Ma', en:'Tue' },
    'dayShort.3': { ca:'Dc', es:'Mi', en:'Wed' },
    'dayShort.4': { ca:'Dj', es:'Ju', en:'Thu' },
    'dayShort.5': { ca:'Dv', es:'Vi', en:'Fri' },
    'dayShort.6': { ca:'Ds', es:'Sá', en:'Sat' },

    // ── Injury Analytics ──
    'analytics.title':       { ca:'📊 Anàlisi de lesions', es:'📊 Análisis de lesiones', en:'📊 Injury Analytics' },
    'analytics.heatmap':     { ca:'Mapa de calor corporal', es:'Mapa de calor corporal', en:'Body Zone Heatmap' },
    'analytics.by_month':    { ca:'Lesions per mes', es:'Lesiones por mes', en:'Injuries by Month' },
    'analytics.injury_prone':{ ca:'Jugadors propensos a lesions', es:'Jugadores propensos a lesiones', en:'Injury-Prone Players' },
    'analytics.th_player':   { ca:'Jugador', es:'Jugador', en:'Player' },
    'analytics.th_injuries': { ca:'Lesions', es:'Lesiones', en:'Injuries' },
    'analytics.th_days_out': { ca:'Dies fora', es:'Días fuera', en:'Days Out' },
    'analytics.th_most_affected':{ ca:'Més afectat', es:'Más afectado', en:'Most Affected' },
    'analytics.most_common_area':    { ca:'Zona més comuna', es:'Zona más común', en:'Most Common Area' },
    'analytics.most_common_severity':{ ca:'Gravetat més comuna', es:'Gravedad más común', en:'Most Common Severity' },

    // ── Short months (charts) ──
    'monthShort.0':  { ca:'Gen', es:'Ene', en:'Jan' },
    'monthShort.1':  { ca:'Feb', es:'Feb', en:'Feb' },
    'monthShort.2':  { ca:'Mar', es:'Mar', en:'Mar' },
    'monthShort.3':  { ca:'Abr', es:'Abr', en:'Apr' },
    'monthShort.4':  { ca:'Mai', es:'May', en:'May' },
    'monthShort.5':  { ca:'Jun', es:'Jun', en:'Jun' },
    'monthShort.6':  { ca:'Jul', es:'Jul', en:'Jul' },
    'monthShort.7':  { ca:'Ago', es:'Ago', en:'Aug' },
    'monthShort.8':  { ca:'Set', es:'Sep', en:'Sep' },
    'monthShort.9':  { ca:'Oct', es:'Oct', en:'Oct' },
    'monthShort.10': { ca:'Nov', es:'Nov', en:'Nov' },
    'monthShort.11': { ca:'Des', es:'Dic', en:'Dec' },

    // ── Misc ──
    'misc.vs':       { ca:'vs', es:'vs', en:'vs' },
    'misc.saving':   { ca:'Desant…', es:'Guardando…', en:'Saving…' },
    'misc.saved':    { ca:'Desat ✓', es:'Guardado ✓', en:'Saved ✓' },
    'misc.click_change': { ca:'Clica per canviar la resposta', es:'Haz clic para cambiar la respuesta', en:'Click to change answer' }
  };

  function t(key) {
    var entry = _i18n[key];
    if (!entry) return key;
    return entry[_lang] || entry.ca || key;
  }

  function setLang(lang) {
    _lang = lang;
    localStorage.setItem('fa_lang', lang);
    document.documentElement.setAttribute('data-lang', lang);
    // Re-render if dashboard is visible
    var session = typeof getSession === 'function' ? getSession() : null;
    if (session) {
      renderDashboard(session);
    }
    // Update auth screens if visible
    applyI18nHtml();
    // Update language switcher active states
    document.querySelectorAll('.lang-link').forEach(function(el) {
      el.classList.toggle('active', el.dataset.lang === _lang);
    });
  }

  function applyI18nHtml() {
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      var key = el.getAttribute('data-i18n');
      var val = t(key);
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = val;
      } else {
        el.textContent = val;
      }
    });
  }
  // ---------- i18n Date Helpers ----------
  // Translated day name (Sunday=0 index)
  function tDay(dayIdx) { return t('dayFull.' + dayIdx); }
  // Translated short day name (Sunday=0 index)
  function tDayShort(dayIdx) { return t('dayShort.' + dayIdx); }
  // Translated month name (0-based)
  function tMonth(monthIdx) { return t('month.' + monthIdx); }
  // Translated short month name (0-based)
  function tMonthShort(monthIdx) { return t('monthShort.' + monthIdx); }

  // Format date like "Thursday 25 May 2026" in current language
  function tDateLong(dateStr) {
    if (!dateStr) return '—';
    var d = new Date(dateStr + 'T12:00:00');
    return tDay(d.getDay()) + ' ' + d.getDate() + ' ' + tMonth(d.getMonth()) + ' ' + d.getFullYear();
  }
  // Format date like "Thu 25 May" in current language
  function tDateShort(dateStr) {
    if (!dateStr) return '—';
    var d = new Date(dateStr + 'T12:00:00');
    return tDayShort(d.getDay()) + ' ' + d.getDate() + ' ' + tMonthShort(d.getMonth());
  }
  // Format date like "25 May" (no day name)
  function tDateDayMonth(dateStr) {
    if (!dateStr) return '—';
    var d = new Date(dateStr + 'T12:00:00');
    return d.getDate() + ' ' + tMonthShort(d.getMonth());
  }
  // Format date like "25 May 2026" (no day name)
  function tDateDMY(dateStr) {
    if (!dateStr) return '—';
    var d = new Date(dateStr + 'T12:00:00');
    return d.getDate() + ' ' + tMonthShort(d.getMonth()) + ' ' + d.getFullYear();
  }
  // Format like "Dl 25/05" (short day + dd/mm)
  function tDayDDMM(dateStr) {
    if (!dateStr) return '';
    var d = new Date(dateStr + 'T12:00:00');
    return tDayShort(d.getDay()) + ' ' + String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
  }
  // #endregion i18n

  // #region Helpers, Cache & Fitness
  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let _usersCache = null, _usersCacheFrame = -1;
  function getUsers() {
    const f = _usersCacheFrame;
    if (_usersCache && f === _usersCacheFrame && f === (window._renderFrame || 0)) return _usersCache;
    _usersCache = JSON.parse(localStorage.getItem('fa_users') || '[]');
    _usersCacheFrame = window._renderFrame || 0;
    return _usersCache;
  }
  function invalidateUsersCache() { _usersCache = null; }
  function saveUsers(users) {
    localStorage.setItem('fa_users', JSON.stringify(users));
    invalidateUsersCache();
  }
  // localDateStr → utils.js

  /* Derive fitnessStatus from the chronological sequence of training answers.
     - Last answer is 'injured' → injured
     - Last answer is NOT injured but the previous one was → doubt ("Recovering from …")
     - Otherwise → fit
     Can be called without saving (for read-only queries). */
  /* The five blobs deriveFitnessStatus() reads. Build once and pass it in
     when deriving for a whole squad — the roster derives per player, so
     without this the page re-parses all five 25 times over.
     Read-only: the function's only .sort() runs on a .filter() result, and
     the fa_users write goes through getUsers(), which caches separately. */
  function fitnessContext() {
    return {
      availData: JSON.parse(localStorage.getItem('fa_training_availability') || '{}'),
      training: getTrainings(),
      injNotes: JSON.parse(localStorage.getItem('fa_injury_notes') || '{}'),
      dismissed: JSON.parse(localStorage.getItem('fa_injury_dismissed') || '{}'),
      injuries: JSON.parse(localStorage.getItem('fa_injuries') || '[]')
    };
  }

  /** `ctx` is optional — pass fitnessContext() when deriving in a loop. */
  function deriveFitnessStatus(playerId, saveResult, ctx) {
    const c = ctx || fitnessContext();
    const availData = c.availData;
    const training = c.training;
    const injNotes = c.injNotes;
    // Staff can discard a self-reported injury from the Medical page. We store
    // the date it was discarded rather than editing the player's own answer:
    // attendance history stays intact, and if he reports injured again on a
    // LATER date the flag comes back on its own.
    const dismissedUpTo = c.dismissed[playerId] || '';

    // Collect all answered trainings for this player, sorted by date
    const answered = training
      .filter(t => t.date && readRecord(availData, playerId, t, 'avail'))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(t => {
        const v = readRecord(availData, playerId, t, 'avail');
        // A discarded 'injured' counts as a plain absence, so it drives
        // neither the 'injured' nor the 'doubt' rule below.
        return (v === 'injured' && dismissedUpTo && t.date <= dismissedUpTo) ? 'no' : v;
      });

    const injNote = injNotes[playerId] || '';
    const last = answered.length ? answered[answered.length - 1] : null;
    const prev = answered.length >= 2 ? answered[answered.length - 2] : null;

    let status, note;
    if (last === 'injured') {
      status = 'injured';
      note = injNote || 'Injured';
    } else if (last && prev === 'injured') {
      status = 'doubt';
      note = 'Recovering from ' + (injNote || 'injury');
    } else {
      status = 'fit';
      note = '';
    }

    // Also check fa_injuries for staff-logged injuries
    const injuries = c.injuries;
    const playerInj = injuries.filter(inj => inj.playerId === playerId);
    const activeInj = playerInj.find(inj => inj.status === 'active');
    const recoveringInj = playerInj.find(inj => inj.status === 'recovering');
    if (activeInj) {
      status = 'injured';
      note = activeInj.muscleGroup + (activeInj.muscleSub ? ' (' + activeInj.muscleSub + ')' : '') + (activeInj.description ? ' – ' + activeInj.description : '');
    } else if (recoveringInj) {
      status = 'doubt';
      note = 'Recovering from ' + (recoveringInj.muscleGroup || 'injury');
    }

    if (saveResult !== false) {
      const users = getUsers();
      const u = users.find(x => x.id === playerId);
      // Only rewrite the roster blob when something actually changed —
      // fa_users is a whole-blob write and concurrent writers clobber each other.
      if (u && (u.fitnessStatus !== status || (u.injuryNote || '') !== note)) {
        u.fitnessStatus = status;
        u.injuryNote = note;
        saveUsers(users);
      }
    }
    return { fitnessStatus: status, injuryNote: note };
  }

  // ---------- Injury helpers ----------
  function getInjuries() { return JSON.parse(localStorage.getItem('fa_injuries') || '[]'); }
  function saveInjuries(arr) { localStorage.setItem('fa_injuries', JSON.stringify(arr)); }
  function getActiveInjuries() { return getInjuries().filter(i => i.status === 'active'); }
  function getRecoveringInjuries() { return getInjuries().filter(i => i.status === 'recovering'); }
  function getPlayerInjuries(pid) { return getInjuries().filter(i => i.playerId === pid); }
  function addInjury(inj) {
    const injuries = getInjuries();
    inj.id = inj.id || String(Date.now()) + '_' + Math.random().toString(36).slice(2, 6);
    injuries.push(inj);
    saveInjuries(injuries);
    return inj;
  }
  function updateInjury(id, changes) {
    const injuries = getInjuries();
    const idx = injuries.findIndex(i => i.id === id);
    if (idx !== -1) { Object.assign(injuries[idx], changes); saveInjuries(injuries); }
  }
  function resolveInjury(id) {
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    updateInjury(id, { status: 'resolved', endDate: todayStr });
  }

  // ---------- Injury data migration ----------
  function migrateInjuryData() {
    if (localStorage.getItem('fa_injury_migration_done')) return;
    if (localStorage.getItem('fa_injuries')) {
      localStorage.setItem('fa_injury_migration_done', '1');
      return;
    }
    const users = getUsers();
    const players = users.filter(u => (u.roles || []).includes('player'));
    const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
    const training = getTrainings().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const injNotes = JSON.parse(localStorage.getItem('fa_injury_notes') || '{}');
    const zoneMap = JSON.parse(localStorage.getItem('fa_injury_zone') || '{}');
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const seasonStart = seasonStartStr(now);
    const injuries = [];
    players.forEach(p => {
      let inWindow = false, windowStart = null, lastInjDate = null;
      const windows = [];
      training.forEach(t => {
        if (!t.date || t.date < seasonStart || t.date > todayStr) return;
        const val = readRecord(availData, p.id, t, 'avail');
        if (val === 'injured') {
          if (!inWindow) { windowStart = t.date; inWindow = true; }
          lastInjDate = t.date;
        } else {
          if (inWindow) { windows.push({ start: windowStart, end: lastInjDate }); inWindow = false; }
        }
      });
      if (inWindow) windows.push({ start: windowStart, end: lastInjDate, current: true });
      const noteRaw = injNotes[p.id] || '';
      const zIdx = zoneMap[p.id] != null ? zoneMap[p.id] : null;
      const zLabel = zIdx != null && BODY_ZONES[zIdx] ? BODY_ZONES[zIdx].label : '';
      // Parse note like "Hamstrings – pulled" or "Biceps Femoris (Hamstrings) – pulled"
      let muscleGroup = '', muscleSub = '', description = '';
      if (noteRaw) {
        const dashParts = noteRaw.split(' – ');
        const pathPart = dashParts[0].trim();
        description = dashParts.length > 1 ? dashParts.slice(1).join(' – ').trim() : '';
        const parenMatch = pathPart.match(/^(.+?)\s*\((.+?)\)$/);
        if (parenMatch) { muscleSub = parenMatch[1].trim(); muscleGroup = parenMatch[2].trim(); }
        else { muscleGroup = pathPart; }
      }
      windows.forEach((w, wi) => {
        const startD = new Date(w.start + 'T12:00:00');
        const endD = w.current ? now : new Date(w.end + 'T12:00:00');
        const days = Math.max(1, Math.floor((endD - startD) / 86400000) + 1);
        let severity = 'minor';
        if (days > 28) severity = 'severe';
        else if (days > 7) severity = 'moderate';
        injuries.push({
          id: p.id + '_mig_' + wi,
          playerId: p.id,
          bodyZone: zIdx,
          bodyZoneLabel: zLabel,
          muscleGroup: muscleGroup || zLabel || 'Unknown',
          muscleSub: muscleSub,
          description: description,
          severity: severity,
          status: w.current ? 'active' : 'resolved',
          startDate: w.start,
          expectedReturn: null,
          endDate: w.current ? null : w.end,
          createdBy: 'migration',
          notes: ''
        });
      });
    });
    localStorage.setItem('fa_injuries', JSON.stringify(injuries));
    localStorage.setItem('fa_injury_migration_done', '1');
  }

  // #endregion Helpers, Cache & Fitness

  // #region Session, Auth & Seed Data
  // ---------- Session (backed by Firebase Auth + Firestore) ----------
  let _currentSession = null;
  // Claims watcher state (see onAuthStateChanged)
  let _claimsUnsub = null;
  let _lastClaimsMs = 0;

  /* Set while a login/registration form is mid-flight.
     Creating the Auth account fires onAuthStateChanged immediately, long
     before joinClub has run and the profile doc exists — its navigate() then
     bounced the user to the login screen for a moment before the form's own
     navigate() took over. On a REJECTED registration it was worse: deleting
     the rolled-back Auth account fires the listener again, which switched
     away from the register view and took the error message with it, so the
     applicant just landed back on login with no explanation. The form
     handlers own navigation while this is set. */
  let _authFlowBusy = false;

  function getSession() {
    return _currentSession;
  }

  function setSession(user) {
    _currentSession = user;
    // Before saveUsers() below writes fa_users through the router: the scope
    // is derived from the session, so it has to follow the session's changes.
    syncDbScope();
    if (user && auth.currentUser) {
      // Persist profile to Firestore. Strip password AND every server-owned
      // field — security rules reject client writes that change them.
      // roles/category/team/staffCategories are decided by the club's roster
      // email lists and applied by joinClub / onRosterWritten / setRole;
      // writing them from here would silently undo a server decision (and
      // used to be a way round the registration gate entirely).
      const {
        password, isAdmin, isTeamLead, teamId,
        roles, category, team, staffCategories,
        ...profile
      } = user;
      db.collection('users').doc(auth.currentUser.uid).set(profile, { merge: true }).catch(console.error);
      // Also update localStorage for compat with roster/availability code
      let users = getUsers();
      // Remove any duplicates by same id OR same email
      const dominated = new Set();
      for (let i = 0; i < users.length; i++) {
        if (String(users[i].id) === String(user.id) || (users[i].email && users[i].email === user.email)) {
          dominated.add(i);
        }
      }
      users = users.filter((_, i) => !dominated.has(i));
      users.push(user);
      saveUsers(users);
    }
  }

  function clearSession() {
    _currentSession = null;
    /* The next account to sign in on this tab must land on its OWN default
       category, not inherit the last one's choice. getCurrentCategory()
       clamps to getVisibleCategories() so a stale value was never a leak,
       but "Totes" would have carried over as a filter nobody selected. */
    _viewCategory = null;
  }

  // ---------- View switching ----------
  function showView(id) {
    $$('.view').forEach(v => v.hidden = true);
    $(id).hidden = false;
    /* The auth views are NOT the fixed dashboard shell — they scroll the
       document, and team setup is long enough to. Switching from the foot of
       one to another would otherwise open it half way down.
       Safe here because showView only runs on a view switch: login, logout,
       navigate(), entering or leaving team setup. Never on a re-render. */
    window.scrollTo(0, 0);
  }


  // Remove RPE entries older than 1 year to keep the data lean.
  // RPE records are canonical (Phase 3b): delete the record docs — the
  // local blob rebuilds from the next collection snapshot. Rules only let
  // players delete their own records, so non-staff sessions prune just
  // their own entries; staff devices clean up everyone's.
  function pruneOldRpe() {
    var raw = localStorage.getItem('fa_player_rpe');
    if (!raw) return;
    var rpeData;
    try { rpeData = JSON.parse(raw); } catch (e) { return; }
    var session = getSession();
    if (!session) return;
    var canPruneAll = session.isAdmin || session.isTeamLead ||
      (session.roles && session.roles.includes('staff'));
    var cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    var cutoffStr = cutoff.toISOString().slice(0, 10);
    for (var k in rpeData) {
      var entry = rpeData[k];
      var date = (entry && entry.date) ? entry.date : '';
      if (!date || date >= cutoffStr) continue;
      if (!canPruneAll && String(k).indexOf(String(session.id) + '_') !== 0) continue;
      DB.removeRecord('rpe', k).catch(function () { /* surfaced via db-write-error */ });
    }
  }


  // ---------- Auth (Firebase) ----------
  const ADMIN_EMAIL = 'marna96@gmail.com';

  /* Which build this is. Bumped alongside sw.js CACHE_NAME — check-deploy.js
     asserts the two agree, because a stale APP_VERSION would make every
     bundled APK claim to be current.

     The web app updates itself on reload; an installed APK does not, because
     Capacitor bundles a copy of the web assets. So an old phone can run
     months-old code against a current backend and nobody notices. The club
     document carries `minAppVersion`, and anything older than it gets a
     banner. Deliberately a nag, not a block: a wrong value here would lock
     the club out, and only the superadmin could undo it.

     Later this same comparison drives a Play/App Store link or an OTA bundle
     swap, so nothing here is throwaway. */
  const APP_VERSION = 72;

  /* SEASON_KEYS used to be duplicated here. It had no readers — archiving
     is entirely server-side — and it had drifted: it still listed
     fa_training_availability, fa_match_availability and fa_player_rpe,
     which the server dropped when those moved to per-record collections.
     A stale copy that nothing reads is worse than no copy, because
     functions/index.js says "keep in step with js/app.js" and would have
     sent the next reader here. The list lives in functions/index.js. */

  // ---------- Category view filter ----------
  /* THREE states, and the third one is why this is not a boolean:
       null  the user has not chosen — fall back to their default category
       ''    the user pressed "Totes" — show every visible category
       'x'   the user pressed a category

     null and '' used to be the same value, so pressing "Totes" was
     indistinguishable from never having pressed anything and the default
     category won every time. See getCurrentCategory(). */
  var _viewCategory = null;

  /**
   * The categories this user is allowed to look at.
   *
   * Staff are scoped to the categories whose staff email list carries their
   * address (`staffCategories`, written server-side from the club rosters).
   * A staff member on no list gets [] and sees the "no category assigned"
   * empty state — deliberately, so an unassigned coach is obvious rather
   * than quietly seeing the whole club.
   */
  function getVisibleCategories() {
    var s = getSession();
    if (!s) return [];
    var enabled = getEnabledCategories();
    if (s.isAdmin || s.isTeamLead) return enabled;
    if (s.roles && s.roles.includes('staff')) {
      var mine = s.staffCategories || [];
      return enabled.filter(function (k) { return mine.indexOf(k) !== -1; });
    }
    return (s.category && enabled.indexOf(s.category) !== -1) ? [s.category] : [];
  }

  /* ── Team quota ─────────────────────────────────────────────
     How many teams a club's lead may create, sold by the superadmin. A
     "team" is one {category}-{letter} pair counted across every category,
     so rosterKeys().length IS the metric.

     None of this is enforcement — a lead can reach Firestore directly, so
     the real check lives in the setClubCategories callable. These exist to
     explain the limit before the server refuses, and to drive the gate. */

  /** The club's allowance. Missing, malformed or < 1 all mean 1. */
  function clubMaxTeams() {
    var n = Math.floor(Number(_clubConfig && _clubConfig.maxTeams));
    return (isFinite(n) && n >= 1) ? n : 1;
  }

  /** Teams the club actually has right now. */
  function clubTeamCount() {
    return rosterKeys(_clubConfig).length;
  }

  /* True when the superadmin has lowered the allowance below what the club
     already has. Existing teams are never removed automatically — the lead
     is asked to choose which one goes. */
  function isClubOverQuota() {
    return !!_clubConfig && clubTeamCount() > clubMaxTeams();
  }

  /* Tell db.js which categories this session may see. From Stage C on, that
     one list drives BOTH the data/ query and the router's write assert, and
     it only takes effect on the next DB.init() — so call this after anything
     that can change roles, category or the club's enabled categories, and
     re-init if the set actually moved. */
  function syncDbScope() {
    try { DB.setScope(getVisibleCategories()); }
    catch (e) { console.warn('DB scope update failed:', e); }
  }

  /**
   * The category every page filters by. '' means "all visible categories",
   * which each render function reads as `!curCat || ...`.
   *
   * Order matters. Scoping comes first: with one visible category there is
   * nothing to choose and "all" and "that one" are the same answer, so the
   * stored default can never widen it. Then the user's explicit choice.
   * Only then the session default, which membershipFrom() stamps on every
   * staff member "for the UI's default view" — it is a landing view, and it
   * must not outrank a button the user just pressed.
   */
  function getCurrentCategory() {
    var visible = getVisibleCategories();
    if (visible.length === 1) return visible[0];
    // Explicitly "Totes". Checked with === because '' is falsy and used to
    // fall through to the session default, which made the button a no-op
    // for every lead and every multi-category coach.
    if (_viewCategory === '') return '';
    // A stale filter must never widen the view past what's allowed.
    if (_viewCategory && visible.indexOf(_viewCategory) !== -1) return _viewCategory;
    var s = getSession();
    if (s && s.category && visible.indexOf(s.category) !== -1) return s.category;
    return '';
  }

  function renderCategoryBar() {
    var cats = getVisibleCategories();
    if (cats.length <= 1) return '';
    var cur = getCurrentCategory();
    var btns = '<button class="cat-bar-btn' + (!cur ? ' active' : '') + '" data-cat="">' + t('cat.all') + '</button>';
    cats.forEach(function (k) {
      btns += '<button class="cat-bar-btn' + (cur === k ? ' active' : '') + '" data-cat="' + k + '">' + CATEGORY_LABELS[k] + '</button>';
    });
    return '<div class="cat-bar">' + btns + '</div>';
  }

  // ---------- Club helpers ----------
  let _clubConfig = null;
  function getClubConfig() { return _clubConfig; }

  function generateClubCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  async function createClub(name, leadEmail, badgeFile) {
    // Generate unique code (codes live in clubCodes/{CODE}, superuser-created)
    let code, exists = true;
    while (exists) {
      code = generateClubCode();
      const snap = await db.collection('clubCodes').doc(code).get();
      exists = snap.exists;
    }
    const clubRef = db.collection('clubs').doc();
    const clubId = clubRef.id;
    let badgeUrl = '';
    if (badgeFile) {
      const ext = badgeFile.name.split('.').pop().toLowerCase();
      const ref = storage.ref('clubBadges/' + clubId + '.' + ext);
      await ref.put(badgeFile);
      badgeUrl = await ref.getDownloadURL();
    }
    const clubData = {
      name: name,
      badgeUrl: badgeUrl,
      leadEmail: leadEmail.trim().toLowerCase(),
      // One letter each, not two. A disabled category's letters are noise —
      // but they become real the moment it is enabled, and seeding two would
      // put a new club with maxTeams:1 instantly over quota, leaving its lead
      // unable to enable ANY category on the mandatory first-run screen.
      categories: {
        amateur:  { enabled: false, letters: ['A'] },
        juvenil:  { enabled: false, letters: ['A'] },
        cadet:    { enabled: false, letters: ['A'] },
        infantil: { enabled: false, letters: ['A'] },
        alevi:    { enabled: false, letters: ['A'] },
        benjami:  { enabled: false, letters: ['A'] }
      },
      fcfLinks: {},
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await clubRef.set(clubData);
    // The join code lives in clubCodes/{CODE} (superuser/functions only) —
    // never on the club doc, which club members can read.
    await db.collection('clubCodes').doc(code).set({ clubId: clubId });
    clubData.id = clubId;
    clubData.code = code;
    return clubData;
  }

  async function getClub(clubId) {
    const doc = await db.collection('clubs').doc(clubId).get();
    if (!doc.exists) return null;
    return Object.assign({ id: doc.id }, doc.data());
  }

  async function updateClub(clubId, data) {
    await db.collection('clubs').doc(clubId).set(data, { merge: true });
  }

  // ---------- Team rosters (staff / player email lists) ----------
  // clubs/{clubId}/rosters/{category}-{letter}. Kept off the club doc because
  // every member can read that; these are email addresses, often of minors.
  // Rules only let you read the docs for YOUR categories, so we fetch them one
  // by one from the known keys — a collection query would be denied outright.

  function rosterRef(clubId, key) {
    return db.collection('clubs').doc(clubId).collection('rosters').doc(key);
  }

  /** All "{category}-{letter}" keys of a club config, optionally one category. */
  function rosterKeys(cfg, onlyCategory) {
    var cats = (cfg && cfg.categories) ? cfg.categories : {};
    var keys = [];
    CATEGORY_ORDER.forEach(function (cat) {
      if (!cats[cat] || !cats[cat].enabled) return;
      if (onlyCategory && cat !== onlyCategory) return;
      var letters = (cats[cat].letters && cats[cat].letters.length) ? cats[cat].letters : ['A'];
      letters.forEach(function (l) { keys.push(cat + '-' + l); });
    });
    return keys;
  }

  /**
   * Load the roster docs this user is allowed to see.
   *
   * Fetched one id at a time on purpose: rules restrict reads to the lead and
   * to staff of that category, and a collection query is rejected outright if
   * any document in it could be denied. Players get nothing.
   */
  async function loadRosters(clubId, cfg) {
    var out = {};
    var s = getSession();
    if (!clubId || !s) return out;
    var canReadAll = s.isAdmin || s.isTeamLead;
    var mine = s.staffCategories || [];
    var isStaff = !!(s.roles && s.roles.includes('staff'));
    if (!canReadAll && !isStaff) return out;
    var keys = rosterKeys(cfg).filter(function (k) {
      return canReadAll || mine.indexOf(k.split('-')[0]) !== -1;
    });
    if (!keys.length) return out;
    await Promise.all(keys.map(function (key) {
      return rosterRef(clubId, key).get().then(function (doc) {
        var d = doc.exists ? doc.data() : {};
        out[key] = {
          staffEmails: Array.isArray(d.staffEmails) ? d.staffEmails : [],
          playerEmails: Array.isArray(d.playerEmails) ? d.playerEmails : []
        };
      }).catch(function () {
        // permission-denied for another category — expected, not an error.
      });
    }));
    return out;
  }

  /** Write one field of one roster doc. Rejects loudly; callers must await. */
  function saveRoster(clubId, key, field, emails) {
    var payload = {};
    payload[field] = emails;
    payload.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    return rosterRef(clubId, key).set(payload, { merge: true });
  }

  function normalizeEmail(v) {
    return String(v || '').trim().toLowerCase();
  }

  function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(v));
  }

  async function loadClubConfig(clubId) {
    // The season window is per-club. Reset it on the no-club branch too, or
    // logging out of a club with a custom boundary leaves the next session
    // slicing its dates by the wrong year.
    if (!clubId || clubId === 'default' || clubId === 'none') {
      _clubConfig = null;
      setSeasonBoundary(null);
      syncDbScope();
      return null;
    }
    _clubConfig = await getClub(clubId);
    setSeasonBoundary(_clubConfig && _clubConfig.seasonBoundary);
    if (_clubConfig) _clubConfig.rosters = await loadRosters(clubId, _clubConfig);
    // Update splash badge and cache image as base64 for instant next load
    var splashImg = document.getElementById('splash-badge');
    if (_clubConfig && _clubConfig.badgeUrl) {
      if (splashImg) splashImg.src = _clubConfig.badgeUrl;
      // Cache base64 version if URL changed
      if (localStorage.getItem('_splash_badge_url') !== _clubConfig.badgeUrl) {
        try {
          var resp = await fetch(_clubConfig.badgeUrl);
          var blob = await resp.blob();
          var reader = new FileReader();
          reader.onloadend = function () {
            localStorage.setItem('_splash_badge', reader.result);
            localStorage.setItem('_splash_badge_url', _clubConfig.badgeUrl);
          };
          reader.readAsDataURL(blob);
        } catch (e) {
          localStorage.setItem('_splash_badge', _clubConfig.badgeUrl);
          localStorage.setItem('_splash_badge_url', _clubConfig.badgeUrl);
        }
      }
    }
    // Enabled categories are part of the visible set, so the scope moves
    // with the config as well as with the session.
    syncDbScope();
    return _clubConfig;
  }

  // Get the club display name (for matching in stored data)
  function getClubName() {
    return (_clubConfig && _clubConfig.name) ? _clubConfig.name : 'Esquerra';
  }

  // Check if a team name in a match is "ours"
  function isOurTeam(name) {
    return name === getClubName();
  }

  // ── Match Events helpers ──
  function getMatchEvents(matchId) {
    var all = JSON.parse(localStorage.getItem('fa_match_events') || '{}');
    return all[matchId] || [];
  }
  function saveMatchEvents(matchId, events) {
    var all = JSON.parse(localStorage.getItem('fa_match_events') || '{}');
    all[matchId] = events;
    localStorage.setItem('fa_match_events', JSON.stringify(all));
    // Sync computed score into fa_matches for backward compat
    var sc = calcMatchScore(events);
    var matches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
    var idx = matches.findIndex(function(x) { return x.id === matchId; });
    if (idx !== -1) {
      matches[idx].score = sc.home + '-' + sc.away;
      localStorage.setItem('fa_matches', JSON.stringify(matches));
    }
  }
  function calcMatchScore(events) {
    var home = 0, away = 0;
    events.forEach(function(e) {
      if (e.type === 'goal') { if (e.side === 'home') home++; else away++; }
      if (e.type === 'own_goal') { if (e.side === 'home') away++; else home++; }
    });
    return { home: home, away: away };
  }
  function parseEventMinute(min) {
    // Supports "45", "45+2", "90+1" — returns a numeric value for sorting
    if (!min) return 999;
    var parts = String(min).split('+');
    return (Number(parts[0]) || 0) + (Number(parts[1]) || 0) * 0.01;
  }
  function formatEventMinute(min) {
    if (!min) return '';
    return String(min) + "'";
  }
  function countYellowCards(events, side, playerId, playerNumber) {
    return events.filter(function(e) {
      if (e.type !== 'yellow' || e.side !== side) return false;
      if (playerId) return e.playerId === playerId;
      if (playerNumber) return e.playerNumber === playerNumber;
      return false;
    }).length;
  }
  /* Resolve the display name for one slot of a match event (scorer, assister,
     player in/out). Order: live squad member → name snapshot → shirt number.

     The snapshot is what lets an erased member keep their name on the
     scoresheet: deleteMember copies the name onto the event before blanking
     the uid, so a goal stays a goal and stays attributed. Opponent events
     never had a uid and use the number, as before. */
  function resolveEventName(id, snapName, number, users) {
    if (id) {
      var p = users.find(function (u) { return String(u.id) === String(id); });
      if (p) return sanitize(p.name);
    }
    if (snapName) return sanitize(snapName);
    if (number) return '#' + sanitize(number);
    return id ? 'Desconegut' : '?';
  }
  function getEventPlayerName(ev, users) {
    return resolveEventName(ev.playerId, ev.playerName, ev.playerNumber, users);
  }
  function getEventIcon(ev, yellowCount) {
    switch (ev.type) {
      case 'goal': return '<span class="ev-icon ev-icon-goal"><img src="img/gol.png" class="ev-sub-img" alt="gol"></span>';
      case 'own_goal': return '<span class="ev-icon ev-icon-og"><img src="img/gol-propia.png" class="ev-sub-img" alt="gol en pròpia"></span>';
      case 'yellow':
        if (yellowCount >= 2) return '<span class="ev-icon ev-icon-yellow ev-yellow-second"><span class="ev-yellow-badge">2</span><img src="img/groga.png" class="ev-sub-img" alt="groga"></span>';
        return '<span class="ev-icon ev-icon-yellow"><img src="img/groga.png" class="ev-sub-img" alt="groga"></span>';
      case 'red': return '<span class="ev-icon ev-icon-red"><img src="img/vermella.png" class="ev-sub-img" alt="vermella"></span>';
      case 'change': return '<span class="ev-icon ev-icon-change"><img src="img/sub-' + ev.side + '.jpg" class="ev-sub-img" alt="sub"></span>';
      case 'penal_fallat': return '<span class="ev-icon ev-icon-penal-miss"><img src="img/penal%20fallat.png" class="ev-sub-img" alt="penal fallat"></span>';
      case 'pal': return '<span class="ev-icon ev-icon-post"><img src="img/pal.png" class="ev-sub-img" alt="pal"></span>';
      default: return '';
    }
  }

  // ── Starting XI helpers ──
  /** `sentData` is optional — pass it when calling this per match. */
  function getStartingXI(matchId, sentData) {
    var sent = sentData || JSON.parse(localStorage.getItem('fa_convocatoria_sent') || '{}');
    var entry = sent[matchId];
    return (entry && Array.isArray(entry.startingXI)) ? entry.startingXI : [];
  }
  function saveStartingXI(matchId, playerIds) {
    var sent = JSON.parse(localStorage.getItem('fa_convocatoria_sent') || '{}');
    if (!sent[matchId]) return;
    sent[matchId].startingXI = playerIds.slice(0, 11);
    localStorage.setItem('fa_convocatoria_sent', JSON.stringify(sent));
  }

  // ── Player match stats aggregation ──
  /* The three blobs computePlayerMatchStats() reads. Same story as
     fitnessContext(): the roster computes stats per player. */
  function matchStatsContext() {
    return {
      matches: JSON.parse(localStorage.getItem('fa_matches') || '[]'),
      allEvents: JSON.parse(localStorage.getItem('fa_match_events') || '{}'),
      sentData: JSON.parse(localStorage.getItem('fa_convocatoria_sent') || '{}')
    };
  }

  /** `ctx` is optional — pass matchStatsContext() when looping players. */
  function computePlayerMatchStats(playerId, ctx) {
    var c = ctx || matchStatsContext();
    var matches = c.matches;
    var allEvents = c.allEvents;
    var sentData = c.sentData;
    var users = getUsers();
    var player = users.find(function(u) { return String(u.id) === String(playerId); });
    var playerTeam = player ? (player.team || '') : '';

    var totals = { goals: 0, assists: 0, matches: 0, minutes: 0, titulars: 0 };
    var matchRows = [];
    var now = new Date();

    matches.forEach(function(m) {
      // Only past matches
      if (!m.date || !m.time) return;
      var matchDate = new Date(m.date + 'T' + m.time + ':00');
      if (matchDate > now) return;

      var sent = sentData[m.id];
      var sentPlayers = (sent && Array.isArray(sent.players)) ? sent.players : [];
      var inConvocatoria = sentPlayers.indexOf(String(playerId)) !== -1 || sentPlayers.indexOf(Number(playerId)) !== -1;
      var matchTeam = m.team || '';
      var isOwnTeam = playerTeam && matchTeam === playerTeam;

      // Include match if player's team OR player was called up
      if (!isOwnTeam && !inConvocatoria) return;

      var events = allEvents[m.id] || [];
      var startingXI = getStartingXI(m.id, sentData);
      var hasStartingXI = startingXI.length > 0;
      var isStarter = startingXI.some(function(id) { return String(id) === String(playerId); });

      // Determine which side is ours
      var ourSide = isOurTeam(m.home) ? 'home' : 'away';
      var oppSide = ourSide === 'home' ? 'away' : 'home';

      // Score
      var score = calcMatchScore(events);
      var homeScore = score.home;
      var awayScore = score.away;
      // Fallback to stored score if no events
      if (events.length === 0 && m.score) {
        var parts = m.score.split('-');
        homeScore = parseInt(parts[0]) || 0;
        awayScore = parseInt(parts[1]) || 0;
      }

      // Result letter (from our team's perspective)
      var ourGoals = ourSide === 'home' ? homeScore : awayScore;
      var theirGoals = ourSide === 'home' ? awayScore : homeScore;
      var resultLetter = ourGoals > theirGoals ? 'V' : (ourGoals < theirGoals ? 'D' : 'E');

      // --- Per-player stats from events ---
      var yellows = 0, reds = 0, goals = 0, assists = 0;
      var goalBreakdown = { jugada: 0, penal: 0, falta: 0 };

      events.forEach(function(ev) {
        var isPlayer = ev.playerId && String(ev.playerId) === String(playerId);
        // Check assists (can be on any goal event, even if same player scored)
        if (ev.type === 'goal' && ev.assistPlayerId && String(ev.assistPlayerId) === String(playerId)) {
          assists++;
        }
        if (!isPlayer) return;
        if (ev.type === 'yellow') yellows++;
        if (ev.type === 'red') reds++;
        if (ev.type === 'goal') {
          goals++;
          if (ev.goalType === 'jugada_oberta') goalBreakdown.jugada++;
          else if (ev.goalType === 'penal') goalBreakdown.penal++;
          else if (ev.goalType === 'falta_directa') goalBreakdown.falta++;
          else goalBreakdown.jugada++; // default to open play
        }
      });

      // --- Minutes calculation (supports multiple in/out subs) ---
      var minutes = '—';
      if (!inConvocatoria) {
        minutes = 'NC';
      } else if (hasStartingXI) {
        // Collect all sub-in and sub-out minutes for this player, sorted
        var subIns = [], subOuts = [];
        var redMinute = null;
        events.forEach(function(ev) {
          if (ev.side === ourSide && ev.type === 'change') {
            if (ev.playerOutId && String(ev.playerOutId) === String(playerId)) {
              var m2 = parseEventMinute(ev.minute);
              if (m2 < 999) subOuts.push(Math.floor(m2));
            }
            if (ev.playerInId && String(ev.playerInId) === String(playerId)) {
              var m2 = parseEventMinute(ev.minute);
              if (m2 < 999) subIns.push(Math.floor(m2));
            }
          }
          if (ev.type === 'red' && ev.playerId && String(ev.playerId) === String(playerId)) {
            var m3 = parseEventMinute(ev.minute);
            if (m3 < 999) redMinute = Math.floor(m3);
          }
        });
        subIns.sort(function(a, b) { return a - b; });
        subOuts.sort(function(a, b) { return a - b; });

        // Build on-pitch intervals: [start, end] pairs
        var intervals = [];
        if (isStarter) {
          // Starter is on from minute 0
          // Pair: start=0, then each subOut ends an interval, each subIn starts a new one
          var onAt = 0;
          var oi = 0, ii = 0;
          // Merge subOuts and subIns chronologically
          while (oi < subOuts.length || ii < subIns.length) {
            // Next expected: if on pitch → look for subOut; if off pitch → look for subIn
            if (onAt !== null) {
              // Player is on pitch, look for next subOut
              if (oi < subOuts.length) {
                intervals.push([onAt, subOuts[oi]]);
                onAt = null;
                oi++;
              } else {
                break; // no more sub-outs, player stays on
              }
            } else {
              // Player is off pitch, look for next subIn
              if (ii < subIns.length) {
                onAt = subIns[ii];
                ii++;
              } else {
                break; // stays off
              }
            }
          }
          // If still on pitch at the end
          if (onAt !== null) {
            var endMin = (redMinute !== null) ? redMinute : 90;
            intervals.push([onAt, endMin]);
          }
        } else {
          // Bench player — first subIn puts them on
          var onAt = null;
          var ii = 0, oi = 0;
          while (ii < subIns.length || oi < subOuts.length) {
            if (onAt === null) {
              // Off pitch, look for subIn
              if (ii < subIns.length) {
                onAt = subIns[ii];
                ii++;
              } else {
                break;
              }
            } else {
              // On pitch, look for subOut
              if (oi < subOuts.length) {
                intervals.push([onAt, subOuts[oi]]);
                onAt = null;
                oi++;
              } else {
                break;
              }
            }
          }
          // If still on pitch at the end
          if (onAt !== null) {
            var endMin = (redMinute !== null) ? redMinute : 90;
            intervals.push([onAt, endMin]);
          }
        }

        // Sum intervals
        minutes = 0;
        intervals.forEach(function(iv) { minutes += iv[1] - iv[0]; });
      }

      // Status: Titular / Suplent / NC
      var status = 'NC';
      if (inConvocatoria) {
        if (hasStartingXI) {
          status = isStarter ? 'Titular' : 'Suplent';
        } else {
          status = '—';
        }
      }

      // Update totals
      totals.matches++;
      totals.goals += goals;
      totals.assists += assists;
      if (typeof minutes === 'number') totals.minutes += minutes;
      if (status === 'Titular') totals.titulars++;

      matchRows.push({
        matchId: m.id,
        date: m.date,
        home: m.home || '',
        away: m.away || '',
        homeScore: homeScore,
        awayScore: awayScore,
        resultLetter: resultLetter,
        isOwnTeam: isOwnTeam,
        minutes: minutes,
        status: status,
        teamLetter: m.team || '',
        yellows: yellows,
        reds: reds,
        assists: assists,
        goals: goals,
        goalBreakdown: goalBreakdown
      });
    });

    // Sort by date descending
    matchRows.sort(function(a, b) { return b.date.localeCompare(a.date); });

    return { totals: totals, matchRows: matchRows };
  }

  // ── Match history table builder ──
  function buildMatchHistoryTable(matchRows) {
    if (!matchRows.length) return '<div class="card"><p style="text-align:center;color:var(--text-secondary);">' + t('mh.no_matches') + '</p></div>';

    var headerRow = '<tr>' +
      '<th>' + t('mh.th_date') + '</th>' +
      '<th class="pmt-col-match">' + t('mh.th_match') + '</th>' +
      '<th>' + t('mh.th_result') + '</th>' +
      '<th></th>' +
      '<th style="font-size:1.1rem;color:#f9a825;line-height:1;vertical-align:middle;">★</th>' +
      '<th><img src="img/chrono.jpg" class="pmt-icon-header" alt="min"></th>' +
      '<th><img src="img/groga.png" class="pmt-icon-header" alt="groga"></th>' +
      '<th><img src="img/vermella.png" class="pmt-icon-header" alt="vermella"></th>' +
      '<th><img src="img/assist.png" class="pmt-icon-header" alt="assist"></th>' +
      '<th><img src="img/gol.png" class="pmt-icon-header" alt="gol"></th>' +
      '<th class="pmt-bd-header">P</th>' +
      '<th class="pmt-bd-header">FL</th>' +
    '</tr>';

    var bodyRows = matchRows.map(function(r) {
      // Format date dd/mm/yy
      var dp = r.date.split('-');
      var dateStr = dp[2] + '/' + dp[1] + '/' + dp[0].slice(2);

      var otherCls = r.isOwnTeam ? '' : ' pmt-other-team';

      // Result circle
      var circleColor = r.resultLetter === 'V' ? 'pmt-win' : (r.resultLetter === 'D' ? 'pmt-loss' : 'pmt-draw');

      // Minutes display
      var minDisplay = r.minutes === 'NC' ? 'NC' : ((typeof r.minutes === 'number') ? r.minutes + "'" : r.minutes);

      // Own club name bold + own score bold (always, regardless of team letter)
      var homeIsOurs = isOurTeam(r.home);
      var awayIsOurs = isOurTeam(r.away);
      var homeNameCls = homeIsOurs ? ' pmt-own' : ' pmt-opp';
      var awayNameCls = awayIsOurs ? ' pmt-own' : ' pmt-opp';
      var homeScoreCls = homeIsOurs ? ' pmt-own' : ' pmt-opp';
      var awayScoreCls = awayIsOurs ? ' pmt-own' : ' pmt-opp';

      var teamBadge = r.teamLetter ? '<span class="pmt-team-letter">' + sanitize(r.teamLetter) + '</span>' : '';

      return '<tr class="' + otherCls + '">' +
        '<td class="pmt-date"><span class="pmt-date-tap">' + dateStr + '</span>' + teamBadge + '</td>' +
        '<td class="pmt-match pmt-col-match"><div class="pmt-stacked"><span class="' + homeNameCls + '">' + sanitize(r.home) + '</span><span class="' + awayNameCls + '">' + sanitize(r.away) + '</span></div></td>' +
        '<td class="pmt-score"><div class="pmt-stacked"><span class="' + homeScoreCls + '">' + r.homeScore + '</span><span class="' + awayScoreCls + '">' + r.awayScore + '</span></div></td>' +
        '<td><span class="pmt-result-circle ' + circleColor + '">' + r.resultLetter + '</span></td>' +
        '<td class="pmt-status' + (r.status === 'Titular' ? ' pmt-status-tit' : (r.status === 'Suplent' ? ' pmt-status-sup' : ' pmt-status-nc')) + '">' + (r.status === 'Titular' ? 'T' : (r.status === 'Suplent' ? 'S' : 'NC')) + '</td>' +
        '<td class="pmt-min">' + minDisplay + '</td>' +
        '<td class="pmt-stat">' + (r.yellows || '') + '</td>' +
        '<td class="pmt-stat">' + (r.reds || '') + '</td>' +
        '<td class="pmt-stat">' + (r.assists || '') + '</td>' +
        '<td class="pmt-stat">' + (r.goals || '') + '</td>' +
        '<td class="pmt-bd-cell">' + (r.goalBreakdown.penal || '') + '</td>' +
        '<td class="pmt-bd-cell">' + (r.goalBreakdown.falta || '') + '</td>' +
      '</tr>';
    }).join('');

    return '<div class="card pmt-card"><div class="card-title">' + t('mh.title') + '</div>' +
      '<div class="pmt-scroll"><table class="player-match-table"><thead>' + headerRow + '</thead><tbody>' + bodyRows + '</tbody></table></div></div>';
  }

  /* Letters for a category, from the club config.
     Falls back to ['A'] — a single team — for the same reasons rosterKeys()
     and prefill-rosters.js do. This used to fall back to ['A','B'], which
     invented a team B that did not exist: the config is loaded async, so
     every render before it resolves, and every caller passing a blank
     category, offered a filter for a squad nobody is in. Omitting a real
     team is recoverable; offering a fake one is not. */
  function getTeamLetters(category) {
    if (_clubConfig && _clubConfig.categories && category) {
      var cat = _clubConfig.categories[category];
      if (cat && cat.enabled && cat.letters && cat.letters.length) return cat.letters;
    }
    return ['A'];
  }

  // Return all enabled categories from club config
  function getEnabledCategories() {
    if (!_clubConfig || !_clubConfig.categories) return [];
    return CATEGORY_ORDER.filter(function (k) {
      var c = _clubConfig.categories[k];
      return c && c.enabled;
    });
  }

  /* ── Training sessions: who is this one for? ────────────────────
     A session used to carry only a `category`, so amateur-A and amateur-B
     literally shared one calendar. It now carries:

       teams     letters it is for; EMPTY MEANS EVERY LETTER of the
                 category, which is exactly what it meant before, so
                 nothing changes for a club that never uses letters
       guests    players called in from another team or category
       excluded  players dropped from this one session
       endTime   when it finishes; blank falls back to 90 minutes

     The called list is DERIVED from those on every read, never stored as
     a snapshot: a player who joins team B tomorrow is picked up for B's
     sessions automatically, whereas a frozen list would quietly rot. Only
     the two exception lists are persisted, and they hold a handful of ids.

     Matches already work this way (`m.team` plus the convocatòria list),
     and fa_tactic_training_boards already learned the same lesson — stamp
     the discriminator on the entry rather than deriving it from a date
     that two squads can share. */
  var DEFAULT_SESSION_MINS = 90;

  function trainingTeams(t) {
    var list = (t && Array.isArray(t.teams)) ? t.teams.filter(Boolean) : [];
    if (list.length) return list;
    return getTeamLetters((t && t.category) || '');
  }

  /** Is this player called to this session? */
  function playerIsCalled(t, u) {
    if (!t || !u) return false;
    var id = String(u.id);
    if (Array.isArray(t.excluded) && t.excluded.map(String).indexOf(id) !== -1) return false;
    if (Array.isArray(t.guests) && t.guests.map(String).indexOf(id) !== -1) return true;
    // A legacy session with no category belongs to everyone, which is what
    // renderTraining's `!t.category || t.category === curCat` already meant.
    if (!t.category) return true;
    if ((u.category || '') !== t.category) return false;
    return trainingTeams(t).indexOf(u.team || '') !== -1;
  }

  /** The squad for a session, in roster order. */
  function calledPlayers(t, users) {
    return (users || []).filter(function (u) {
      return u && (u.roles || []).indexOf('player') !== -1 && playerIsCalled(t, u);
    });
  }

  /** The sessions a player is called to — the one filter every player page uses. */
  function playerTrainings(u, allTraining) {
    return (allTraining || []).filter(function (t) { return playerIsCalled(t, u); });
  }

  /* THE reader for fa_training.
     Every navigation now addresses a session by id, so a legacy row without
     one could be listed and never opened. Healing here rather than in
     renderStaffTraining -- where it used to live -- means it happens on
     every surface, including the player pages a coach never visits.

     The write-back is guarded: fa_training is not in the player allowlist
     in firestore.rules, so persisting from a player's client would be
     denied and surface an error toast. Players heal in memory only, which
     is all they need to open a session. */
  function getTrainings() {
    var all = [];
    try { all = JSON.parse(localStorage.getItem('fa_training') || '[]'); } catch (e) { all = []; }
    if (!Array.isArray(all)) return [];
    var healed = false;
    all.forEach(function (t) {
      if (t && !t.id) {
        t.id = 'tr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        healed = true;
      }
    });
    if (healed) {
      var s = getSession();
      var canWrite = !!(s && (((s.roles || []).indexOf('staff') !== -1) || s.isAdmin || s.isTeamLead));
      if (canWrite) localStorage.setItem('fa_training', JSON.stringify(all));
    }
    return all;
  }

  function hhmmToMins(v) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(v || '').trim());
    if (!m) return null;
    var h = Number(m[1]);
    var mi = Number(m[2]);
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }

  /* [start, end) in minutes past midnight. `time` is normally a plain
     HH:MM but a vestigial "HH:MM - HH:MM" range exists in old rows and is
     defended against everywhere else in this file — so if endTime is blank
     the range's own second half is used before falling back to 90 min. */
  function sessionWindow(t) {
    if (!t) return null;
    var parts = String(t.time || '').split(' - ');
    var start = hhmmToMins(parts[0]);
    if (start === null) return null;
    var end = hhmmToMins(t.endTime);
    if (end === null && parts.length > 1) end = hhmmToMins(parts[1]);
    if (end === null || end <= start) end = start + DEFAULT_SESSION_MINS;
    return { start: start, end: end };
  }

  /** Two sessions clash when they share a date and their windows intersect. */
  function trainingsOverlap(a, b) {
    if (!a || !b) return false;
    if (!a.date || a.date !== b.date) return false;
    if (a.id && b.id && String(a.id) === String(b.id)) return false;
    var wa = sessionWindow(a);
    var wb = sessionWindow(b);
    if (!wa || !wb) return false;
    return wa.start < wb.end && wb.start < wa.end;
  }

  /* ── Player-submitted records: keyed by SESSION, not by date ────
     Availability, session RPE and the staff override were all keyed
     `{uid}_{date}`. That was fine while a player could only ever have one
     session a day. Guest call-ups break it: borrowed for another squad's
     evening session, a player's two answers collide and the second
     silently overwrites the first.

     New records are keyed by the session id. Legacy ones stay where they
     are and are still READ, because the v43-era APK on the phones knows
     only the date form and will keep writing it. Both live in the same
     collection and cannot collide — a session id is `tr_…`, never a date.

     All three keys move TOGETHER. Every read site does
     `overrides[k] || avail[k]` with the same string; moving one without
     the other decouples a staff override from the answer it overrides. */
  function recordKey(playerId, sess, kind) {
    var mid = (kind === 'rpe') ? '_training_' : '_';
    return String(playerId) + mid + String((sess && sess.id) || '');
  }

  function legacyRecordKey(playerId, sess, kind) {
    var mid = (kind === 'rpe') ? '_training_' : '_';
    return String(playerId) + mid + String((sess && sess.date) || '');
  }

  /* A legacy record can only ever have meant the player's OWN session: the
     client that wrote it had no concept of a call-up. Honouring it for a
     guest appearance would make a pre-feature answer also answer a session
     the player was never part of. */
  function mayReadLegacyRecord(sess, playerId) {
    if (!sess || !sess.date) return false;
    return !(Array.isArray(sess.guests) &&
      sess.guests.map(String).indexOf(String(playerId)) !== -1);
  }

  /** Look a record up for one player and one session. New format wins. */
  function readRecord(map, playerId, sess, kind) {
    if (!map) return undefined;
    var v = map[recordKey(playerId, sess, kind)];
    if (v !== undefined) return v;
    if (mayReadLegacyRecord(sess, playerId)) {
      return map[legacyRecordKey(playerId, sess, kind)];
    }
    return undefined;
  }

  async function handleRegister(e) {
    e.preventDefault();
    const name = $('#reg-name').value.trim();
    const email = $('#reg-email').value.trim().toLowerCase();
    const pw = $('#reg-password').value;
    const pw2 = $('#reg-password2').value;
    const codeInput = $('#reg-team-code');
    const teamCode = codeInput ? codeInput.value.trim().toUpperCase() : '';
    const errEl = $('#register-error');

    if (pw !== pw2) {
      errEl.textContent = t('error.passwords_mismatch');
      errEl.hidden = false;
      return;
    }

    // From here on we own navigation: creating (and rolling back) the Auth
    // account fires onAuthStateChanged, whose navigate() would otherwise
    // flash the login screen mid-signup and wipe any error we show.
    _authFlowBusy = true;
    // Keep the applicant on the register form with the reason visible.
    const failRegister = async (cred, message) => {
      if (cred) { try { await cred.user.delete(); } catch (e) { /* already gone */ } }
      errEl.textContent = message;
      errEl.hidden = false;
      _authFlowBusy = false;
      showView('#view-register');
      _hideSplash();
    };

    try {
      // Create Firebase Auth account first (needed for Firestore access)
      const cred = await auth.createUserWithEmailAndPassword(email, pw);
      const uid = cred.user.uid;

      // Everyone except the superuser must join a club with a code.
      // Membership is assigned server-side by the joinClub Cloud Function
      // (it validates the code and writes teamId/isTeamLead — clients can't).
      // Team leads join with the club code too; the function detects them
      // by matching their email against the club's leadEmail.
      let club = null;
      if (email !== ADMIN_EMAIL) {
        if (!teamCode) {
          await failRegister(cred, t('error.need_team_code'));
          return;
        }
        try {
          const joinFn = firebase.app().functions('us-central1').httpsCallable('joinClub');
          const res = await joinFn({ code: teamCode.trim().toUpperCase() });
          club = res.data;
        } catch (joinErr) {
          // No profile doc exists yet, so deleting the auth user leaves
          // nothing behind. This is also the "your address is on no roster
          // list" rejection — the function's message says to ask their coach,
          // and it must survive on screen.
          await failRegister(cred,
            (joinErr && joinErr.message) ? joinErr.message : t('error.invalid_team_code'));
          return;
        }
      }

      // Profile fields the client owns. roles/category/team are NOT among
      // them: joinClub has just derived those from the club's roster email
      // lists, and merging blanks over the top would wipe the assignment
      // (and drop the member back on the role-picker screen).
      const profileFields = {
        id: uid,
        name,
        email,
        position: '',
        playerNumber: '',
        profilePic: '',
        dob: '',
        profileSetupDone: false
      };
      await db.collection('users').doc(uid).set(profileFields, { merge: true });

      // Runtime session includes the server-assigned membership and the
      // derived flags (neither of which is client-writable).
      const newUser = Object.assign({}, profileFields, {
        roles: (club && club.roles) || [],
        category: (club && club.category) || '',
        team: (club && club.team) || '',
        staffCategories: (club && club.staffCategories) || [],
        isAdmin: email === ADMIN_EMAIL,
        isTeamLead: club ? !!club.isTeamLead : false,
        teamId: club ? club.clubId : 'none'
      });
      _currentSession = newUser;
      // joinClub set custom claims — force-refresh the ID token so the
      // new security rules authorize this session immediately.
      if (club) {
        try { await cred.user.getIdToken(true); } catch (tokenErr) { console.warn('Token refresh failed:', tokenErr); }
      }
      // Load club config
      if (club) await loadClubConfig(club.clubId);
      // Push to localStorage for compat with roster/availability code
      const users = getUsers();
      users.push(newUser);
      saveUsers(users);
      // Sync team data between localStorage and Firestore
      if (club) await DB.init(club.clubId, getVisibleCategories());
      e.target.reset();
      errEl.hidden = true;
      _authFlowBusy = false;
      navigate();
    } catch (err) {
      const msg = err.code === 'auth/email-already-in-use' ? 'An account with this email already exists.'
        : err.code === 'auth/weak-password' ? 'Password should be at least 6 characters.'
        : err.message;
      errEl.textContent = msg;
      errEl.hidden = false;
      // Stay on the register form with the reason visible. The rolled-back
      // Auth account has already signed us out; without this the listener
      // would have swapped in the login view and hidden the message.
      _authFlowBusy = false;
      showView('#view-register');
      _hideSplash();
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    const email = $('#login-email').value.trim().toLowerCase();
    const pw = $('#login-password').value;
    const errEl = $('#login-error');
    // Same reason as handleRegister: signing in fires onAuthStateChanged
    // before this handler has loaded the profile, and its navigate() would
    // flash a screen we are about to replace.
    _authFlowBusy = true;
    try {
      const cred = await auth.signInWithEmailAndPassword(email, pw);
      const uid = cred.user.uid;
      // Load profile from Firestore
      const doc = await db.collection('users').doc(uid).get();
      let user;
      if (doc.exists) {
        user = doc.data();
        user.id = uid;
      } else {
        // Fallback: create profile if missing. roles/category/team are
        // server-owned (joinClub derives them from the club roster lists) and
        // rules reject them on create — the user is routed to join-club next.
        const seed = { id: uid, name: '', email, position: '', playerNumber: '', profilePic: '', dob: '', profileSetupDone: false };
        await db.collection('users').doc(uid).set(seed);
        user = Object.assign({ roles: [], category: '', team: '' }, seed);
      }
      // Ensure admin flag & fields (runtime-only; never persisted by clients)
      user.isAdmin = user.email === ADMIN_EMAIL;
      if (user.isTeamLead === undefined) user.isTeamLead = false;
      if (!user.category) user.category = '';
      if (!Array.isArray(user.staffCategories)) user.staffCategories = [];
      if (!user.teamId || user.teamId === 'default') {
        // No club yet — the app routes to the join-club view, where the
        // joinClub Cloud Function assigns membership (leads included).
        user.teamId = 'none';
      }
      if (user.profileSetupDone === undefined) user.profileSetupDone = false;
      if (!user.position) user.position = '';
      if (!user.playerNumber) user.playerNumber = '';
      if (!user.profilePic) user.profilePic = '';
      // Update localStorage for compat
      let users = getUsers();
      users = users.filter(u => String(u.id) !== String(uid) && u.email !== email);
      users.push(user);
      saveUsers(users);
      _currentSession = user;
      // Load club config + sync team data
      if (user.teamId && user.teamId !== 'none') {
        await loadClubConfig(user.teamId);
        await DB.init(user.teamId, getVisibleCategories());
      } else {
        // No team — flush stale localStorage so old data doesn't leak
        DB.flush();
      }
      e.target.reset();
      errEl.hidden = true;
      _authFlowBusy = false;
      navigate();
    } catch (err) {
      const msg = (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential')
        ? 'Invalid email or password.'
        : err.message;
      errEl.textContent = msg;
      errEl.hidden = false;
      _authFlowBusy = false;
      showView('#view-login');
      _hideSplash();
    }
  }

  // #endregion Session, Auth & Seed Data

  // #region Navigation, Team Setup & Profile
  // ---------- Navigation ----------
  function _hideSplash() {
    var el = document.getElementById('app-splash');
    if (el) {
      el.style.opacity = '0';
      setTimeout(function() { el.remove(); }, 400);
      if (window._splashInterval) clearInterval(window._splashInterval);
    }
  }

  function navigate() {
    window._renderFrame = (window._renderFrame || 0) + 1;
    invalidateUsersCache();
    const session = getSession();
    if (!session) { showView('#view-login'); _hideSplash(); return; }
    // Users without a club must join one first (superuser skips — manages clubs from admin settings)
    if (!session.isAdmin && (!session.teamId || session.teamId === 'none' || session.teamId === 'default')) {
      showView('#view-join-club');
      _hideSplash();
      return;
    }
    // Profile setup for new users
    if (!session.profileSetupDone) {
      showProfileSetup(session);
      _hideSplash();
      return;
    }
    /* Over quota: the superadmin lowered the club's allowance below what it
       already has. The LEAD is taken straight to the category screen and
       asked to remove a team — sitting here in navigate() rather than in
       renderPage means they never reach the dashboard at all. Staff and
       players are handled at the page layer, because a staff+player member
       is both and this branch could only pick one. */
    if (session.isTeamLead && isClubOverQuota()) {
      showTeamSetup();
      _hideSplash();
      return;
    }
    // Team lead first-time setup (categories not yet configured)
    if (session.isTeamLead && _clubConfig && !_clubConfig._setupDone) {
      const cats = _clubConfig.categories || {};
      const anyEnabled = Object.values(cats).some(c => c && c.enabled);
      if (!anyEnabled) {
        showTeamSetup();
        _hideSplash();
        return;
      }
    }
    if (!session.roles || session.roles.length === 0) {
      showRoleSelection(session);
      _hideSplash();
      return;
    }
    showView('#view-dashboard');
    renderDashboard(session);
    _hideSplash();
  }

  // ---------- Join Club ----------
  async function handleJoinClub(e) {
    e.preventDefault();
    const codeInput = $('#join-team-code');
    const code = codeInput.value.trim().toUpperCase();
    const errEl = $('#join-club-error');
    if (!code) {
      errEl.textContent = t('error.enter_code');
      errEl.hidden = false;
      return;
    }
    // Membership is assigned server-side: the joinClub Cloud Function
    // validates the code and writes teamId/isTeamLead (clients can't).
    let club;
    try {
      const joinFn = firebase.app().functions('us-central1').httpsCallable('joinClub');
      const res = await joinFn({ code: code });
      club = res.data;
    } catch (err) {
      errEl.textContent = (err && err.message) ? err.message : t('error.invalid_code');
      errEl.hidden = false;
      return;
    }
    const session = getSession();
    session.teamId = club.clubId;
    if (club.isTeamLead) session.isTeamLead = true;
    // joinClub derived these from the club's roster email lists. Copying them
    // into the session is what lets navigate() skip the role-selection screen.
    session.roles = club.roles || [];
    session.category = club.category || '';
    session.team = club.team || '';
    session.staffCategories = club.staffCategories || [];
    setSession(session);
    // joinClub set custom claims — force-refresh the ID token so the
    // new security rules authorize this session immediately.
    try { await auth.currentUser.getIdToken(true); } catch (e) { console.warn('Token refresh failed:', e); }
    await loadClubConfig(club.clubId);
    await DB.init(club.clubId, getVisibleCategories());
    // Add this user to the club's fa_users
    let users = getUsers();
    if (!users.find(u => String(u.id) === String(session.id))) {
      users.push(session);
      saveUsers(users);
    }
    errEl.hidden = true;
    e.target.reset();
    navigate();
  }

  // ---------- Team Setup (Team Lead config) ----------
  // CATEGORY_LABELS, CATEGORY_ORDER → utils.js

  /* The ONE place that decides what a category's letter chips look like.
     It is called from the first render and again whenever a category is
     toggled — two copies is exactly how enabling a category ended up
     leaving the row painted as disabled: a greyed A and no "+", so the
     lead could tick Juvenil and then had no way to add a team to it.

     Teams are removed from the END, so only the last chip is clickable.
     Every chip used to look identical and clickable while doing two very
     different things — destroying a saved team, or silently vanishing if
     unsaved. An inert chip says "not this one" before the click.
     A DISABLED row shows one greyed A that turns the category ON. */
  function _letterChipsHtml(catKey, letters, enabled) {
    var chips = letters.map(function (l, idx) {
      var cls = 'ts-letter-chip';
      if (!enabled) cls += ' ts-letter-chip-off';
      else if (idx === letters.length - 1) cls += ' ts-letter-chip-last';
      else cls += ' ts-letter-chip-fixed';
      return '<span class="' + cls + '" data-letter="' + l + '" data-cat="' + catKey + '">' + l + '</span>';
    }).join('');
    // No "+" until the category is on — there is nothing to add a team to.
    return chips + (enabled ?
      '<button class="ts-letter-add" data-cat="' + catKey + '" title="' + t('ts.add_team') + '">+</button>' : '');
  }

  /* Repaint one row's chips in place. Repainting the whole container would
     throw away chips added in OTHER categories since the last save. */
  function _paintLetters(row, letters, enabled) {
    var el = row.querySelector('.ts-letters');
    if (el) el.innerHTML = _letterChipsHtml(row.dataset.cat, letters, enabled);
  }

  /**
   * @param {Object} [opts] `{cancellable:true}` from the Settings entry only.
   *   The two forced entries — over quota, and a lead with no enabled
   *   category — must stay inescapable: escaping the first defeats the gate,
   *   and behind the second there is no configured club to go back to.
   *   Reset on EVERY call: deleteTeam re-enters through navigate(), and a
   *   stale flag there would let an over-quota lead walk away.
   */
  function showTeamSetup(opts) {
    _tsCancellable = !!(opts && opts.cancellable);
    var backBtn = document.getElementById('btn-back-team-setup');
    if (backBtn) backBtn.hidden = !_tsCancellable;
    showView('#view-team-setup');
    var cats = (_clubConfig && _clubConfig.categories) ? _clubConfig.categories : {};
    var container = document.getElementById('team-setup-categories');
    if (!container) return;
    var html = '';
    CATEGORY_ORDER.forEach(function (key) {
      // ['A'], not ['A','B'] — rosterKeys() and getTeamLetters() both fall
      // back to one letter, so this was the odd one out: ticking a category
      // on created TWO teams silently. Under a quota that is immediately a
      // limit breach, and it was never intended even without one.
      var cat = cats[key] || { enabled: false, letters: ['A'] };
      /* A DISABLED category's stored letters mean nothing — nobody is in it,
         and disabling one that still has teams is now blocked, so they can
         only be left over from the old ['A','B'] seed. Showing them would
         hand a new club two teams the moment a category is ticked, which
         under maxTeams:1 blocks the lead from enabling anything at all. */
      var letters = (cat.enabled && cat.letters && cat.letters.length) ?
        cat.letters : ['A'];
      var active = cat.enabled ? ' active' : '';
      html += '<div class="ts-cat-row' + active + '" data-cat="' + key + '">' +
        '<label class="ts-cat-toggle"><input type="checkbox"' + (cat.enabled ? ' checked' : '') +
        ' data-cat="' + key + '"><span class="slider"></span></label>' +
        '<span class="ts-cat-name">' + CATEGORY_LABELS[key] + '</span>' +
        '<span class="ts-letters" data-cat="' + key + '">' +
        _letterChipsHtml(key, letters, cat.enabled) +
        '</span></div>';
    });
    container.innerHTML = html;
    _refreshTeamSetupFcf();
    _refreshTeamSetupSchedules();
    _refreshTeamSetupStaff();
    _refreshTeamSetupQuota();
    _bindTeamSetupEvents(container);
  }

  /**
   * Staff email lists, one block per {category}-{letter}.
   *
   * Unlike the FCF/schedule sections this does NOT re-render purely from
   * _clubConfig: toggling a letter would then wipe a half-typed list of
   * addresses. Current DOM values win over the stored ones.
   */
  function _refreshTeamSetupStaff() {
    var section = document.getElementById('team-setup-staff');
    var inputsEl = document.getElementById('team-setup-staff-inputs');
    if (!section || !inputsEl) return;
    var container = document.getElementById('team-setup-categories');
    if (!container) return;
    var rows = container.querySelectorAll('.ts-cat-row.active');
    if (!rows.length) { section.hidden = true; return; }
    section.hidden = false;

    // Snapshot what is on screen right now, then layer it over what's stored.
    var typed = _collectStaffEmailsFromDom();
    var stored = (_clubConfig && _clubConfig.rosters) ? _clubConfig.rosters : {};

    var html = '';
    rows.forEach(function (row) {
      var catKey = row.dataset.cat;
      row.querySelectorAll('.ts-letter-chip').forEach(function (chip) {
        var key = catKey + '-' + chip.dataset.letter;
        var emails = typed[key] || (stored[key] && stored[key].staffEmails) || [];
        if (!emails.length) emails = [''];
        html += '<div class="ts-sched-block" data-staff-key="' + key + '">' +
          '<div class="ts-sched-title">' + CATEGORY_LABELS[catKey] + ' ' + chip.dataset.letter + '</div>' +
          '<div class="ts-staff-list" data-staff-key="' + key + '">' +
          emails.map(function (em, idx) { return _buildStaffEmailRow(key, idx, em); }).join('') +
          '</div>' +
          '<button class="btn btn-outline btn-small ts-add-staff" data-staff-key="' + key +
          '" style="margin:.4rem 0 .8rem;">' + t('auth.staff_add') + '</button>' +
          '</div>';
      });
    });
    inputsEl.innerHTML = html;
  }

  function _buildStaffEmailRow(key, idx, email) {
    return '<div class="ts-sched-row" data-staff-idx="' + idx + '">' +
      '<input type="email" inputmode="email" autocomplete="off" data-staff-email="' + key + '-' + idx +
      '" value="' + sanitize(email || '') + '" placeholder="' + t('auth.email_ph') + '" style="flex:1;">' +
      '<button class="btn btn-small ts-remove-staff" title="' + t('btn.remove') +
      '" style="padding:.2rem .5rem;min-width:0;color:#e53935;flex-shrink:0;">✕</button>' +
      '</div>';
  }

  /** Read the staff-email section back out of the DOM, keyed by team. */
  function _collectStaffEmailsFromDom() {
    var out = {};
    document.querySelectorAll('#team-setup-staff-inputs .ts-staff-list').forEach(function (list) {
      var emails = [];
      list.querySelectorAll('input[data-staff-email]').forEach(function (inp) {
        var v = normalizeEmail(inp.value);
        if (v && emails.indexOf(v) === -1) emails.push(v);
      });
      out[list.dataset.staffKey] = emails;
    });
    return out;
  }

  /** What is typed into the FCF inputs right now, keyed {cat}-{letter}. */
  function _collectFcfFromDom() {
    var out = {};
    document.querySelectorAll('#team-setup-fcf-inputs input[data-fcf-key]')
      .forEach(function (inp) { out[inp.dataset.fcfKey] = inp.value; });
    return out;
  }

  /* Typed values win over stored ones, the way _refreshTeamSetupStaff has
     always done it. Without this a chip click or a category toggle re-rendered
     straight from _clubConfig and silently threw away a half-typed link. */
  function _refreshTeamSetupFcf() {
    var fcfSection = document.getElementById('team-setup-fcf');
    var fcfInputs = document.getElementById('team-setup-fcf-inputs');
    if (!fcfSection || !fcfInputs) return;
    var container = document.getElementById('team-setup-categories');
    if (!container) return;
    var rows = container.querySelectorAll('.ts-cat-row.active');
    if (!rows.length) { fcfSection.hidden = true; return; }
    fcfSection.hidden = false;
    var existingLinks = (_clubConfig && _clubConfig.fcfLinks) ? _clubConfig.fcfLinks : {};
    var typedLinks = _collectFcfFromDom();
    var html = '';
    rows.forEach(function (row) {
      var catKey = row.dataset.cat;
      row.querySelectorAll('.ts-letter-chip').forEach(function (chip) {
        var letter = chip.dataset.letter;
        var linkKey = catKey + '-' + letter;
        var val = (linkKey in typedLinks) ? typedLinks[linkKey] : (existingLinks[linkKey] || '');
        html += '<div class="ts-fcf-row">' +
          '<span class="ts-fcf-label">' + CATEGORY_LABELS[catKey] + ' ' + letter + '</span>' +
          '<input type="url" placeholder="https://fcf.cat/classificacio/..." data-fcf-key="' + linkKey + '" value="' + sanitize(val) + '">' +
          '</div>';
      });
    });
    fcfInputs.innerHTML = html;
  }

  // DAY_VALUES → utils.js

  /**
   * The schedules currently on screen, keyed {cat}-{letter}.
   *
   * Extracted so the save path and the re-render share one reader: the
   * refresher needs it so a chip click cannot discard a half-typed schedule,
   * and two copies of this shape would drift.
   *
   * Scoped to the schedules section — the staff section reuses
   * .ts-sched-block for its styling and must not be picked up here.
   */
  function _collectSchedulesFromDom() {
    var schedules = {};
    document.querySelectorAll('#team-setup-schedule-inputs .ts-sched-block').forEach(function (block) {
      var schedKey = block.dataset.schedKey;
      var training = [];
      var list = block.querySelector('.ts-training-list');
      if (list) {
        list.querySelectorAll('.ts-sched-row').forEach(function (row) {
          var daySel = row.querySelector('select[data-train-day]');
          var timeInp = row.querySelector('input[data-train-time]');
          var endInp = row.querySelector('input[data-train-end]');
          var locInp = row.querySelector('input[data-train-location]');
          var linkInp = row.querySelector('input[data-train-link]');
          var day = daySel ? daySel.value : '';
          var time = timeInp ? timeInp.value.trim() : '';
          var endTime = endInp ? endInp.value.trim() : '';
          var location = locInp ? locInp.value.trim() : '';
          var link = linkInp ? linkInp.value.trim() : '';
          if (day || time || location) training.push({ day: day, time: time, endTime: endTime, location: location, link: link });
        });
      }
      if (!training.length) training.push({ day: '', time: '', location: '' });
      var homeDaySel = block.querySelector('[data-home-day="' + schedKey + '"]');
      var homeTimeInp = block.querySelector('[data-home-time="' + schedKey + '"]');
      var homeLocInp = block.querySelector('[data-home-location="' + schedKey + '"]');
      var homeLinkInp = block.querySelector('[data-home-link="' + schedKey + '"]');
      schedules[schedKey] = {
        training: training,
        homeGame: {
          day: homeDaySel ? homeDaySel.value : '',
          time: homeTimeInp ? homeTimeInp.value : '',
          location: homeLocInp ? homeLocInp.value.trim() : '',
          link: homeLinkInp ? homeLinkInp.value.trim() : ''
        }
      };
    });
    return schedules;
  }

  function _refreshTeamSetupSchedules() {
    var section = document.getElementById('team-setup-schedules');
    var inputsEl = document.getElementById('team-setup-schedule-inputs');
    if (!section || !inputsEl) return;
    var container = document.getElementById('team-setup-categories');
    if (!container) return;
    var rows = container.querySelectorAll('.ts-cat-row.active');
    if (!rows.length) { section.hidden = true; return; }
    section.hidden = false;
    var existingSchedules = (_clubConfig && _clubConfig.schedules) ? _clubConfig.schedules : {};
    // Typed values win over stored ones, as the staff list has always done.
    var typedSchedules = _collectSchedulesFromDom();
    var dayLabelsI18n = ['day.monday','day.tuesday','day.wednesday','day.thursday','day.friday','day.saturday','day.sunday'];
    var dayOptions = DAY_VALUES.map(function (d, i) {
      return '<option value="' + d + '">' + t(dayLabelsI18n[i]) + '</option>';
    }).join('');

    var html = '';
    rows.forEach(function (row) {
      var catKey = row.dataset.cat;
      row.querySelectorAll('.ts-letter-chip').forEach(function (chip) {
        var letter = chip.dataset.letter;
        var schedKey = catKey + '-' + letter;
        var sched = typedSchedules[schedKey] || existingSchedules[schedKey] || {};
        var trainings = sched.training || [{ day: '', time: '', location: '' }];
        var homeGame = sched.homeGame || { day: 'sat', time: '', location: '' };

        html += '<div class="ts-sched-block" data-sched-key="' + schedKey + '">';
        html += '<div class="ts-sched-title">' + CATEGORY_LABELS[catKey] + ' ' + letter + '</div>';

        // Training sessions
        html += '<div class="ts-sched-sub">Entrenaments</div>';
        html += '<div class="ts-training-list" data-sched-key="' + schedKey + '">';
        trainings.forEach(function (t, idx) {
          html += _buildTrainingRow(schedKey, idx, t, dayOptions);
        });
        html += '</div>';
        html += '<button class="btn btn-outline btn-small ts-add-training" data-sched-key="' + schedKey + '" style="margin:.4rem 0 .8rem;">+ Entrenament</button>';

        // Home game
        html += '<div class="ts-sched-sub">Partit a casa</div>';
        html += '<div class="ts-sched-row">';
        html += '<select data-home-day="' + schedKey + '">' + _selectedDayOptions(dayOptions, homeGame.day) + '</select>';
        html += '<input type="text" inputmode="numeric" data-home-time="' + schedKey + '" value="' + (homeGame.time || '') + '" placeholder="HH:MM" maxlength="5" style="width:70px;text-align:center;">';
        html += '<input type="text" data-home-location="' + schedKey + '" value="' + sanitize(homeGame.location || '') + '" placeholder="Ubicació">';
        html += '<input type="text" data-home-link="' + schedKey + '" value="' + sanitize(homeGame.link || '') + '" placeholder="Link">';
        html += '</div>';

        html += '</div>';
      });
    });
    inputsEl.innerHTML = html;
  }

  /* Start AND end time. The end time is what makes a clash computable: two
     sessions overlap when their [start, end) intervals intersect, and until
     this field existed the app had no duration anywhere -- only three
     different hardcoded windows (2h, 90min, 60min) used for unrelated UI
     status decisions. Left blank it falls back to DEFAULT_SESSION_MINS. */
  function _buildTrainingRow(schedKey, idx, t, dayOptions) {
    return '<div class="ts-sched-row" data-train-idx="' + idx + '">' +
      '<select data-train-day="' + schedKey + '-' + idx + '">' + _selectedDayOptions(dayOptions, t.day) + '</select>' +
      '<input type="text" inputmode="numeric" data-train-time="' + schedKey + '-' + idx + '" value="' + (t.time || '') + '" placeholder="HH:MM" maxlength="5" style="width:70px;text-align:center;">' +
      '<span class="ts-sched-dash">-</span>' +
      '<input type="text" inputmode="numeric" data-train-end="' + schedKey + '-' + idx + '" value="' + (t.endTime || '') + '" placeholder="HH:MM" maxlength="5" style="width:70px;text-align:center;">' +
      '<input type="text" data-train-location="' + schedKey + '-' + idx + '" value="' + sanitize(t.location || '') + '" placeholder="Ubicació">' +
      '<input type="text" data-train-link="' + schedKey + '-' + idx + '" value="' + sanitize(t.link || '') + '" placeholder="Link">' +
      '<button class="btn btn-small ts-remove-training" data-sched-key="' + schedKey + '" data-train-idx="' + idx + '" title="Eliminar" style="padding:.2rem .5rem;min-width:0;color:#e53935;flex-shrink:0;">✕</button>' +
      '</div>';
  }

  function _selectedDayOptions(baseOptions, selected) {
    if (!selected) return '<option value="" selected>Dia…</option>' + baseOptions;
    return '<option value="">Dia…</option>' + baseOptions.replace(
      'value="' + selected + '"',
      'value="' + selected + '" selected'
    );
  }

  /* Teams the editor would save right now. Counted from the DOM, not from
     _clubConfig: on this screen the DOM is the source of truth until save,
     so a chip added a second ago has to count.

     `exceptRow` skips one row, and the toggle handler needs it: `change`
     fires AFTER the checkbox is checked, so the row being enabled is
     already inside this total. Adding its letters on top counted it twice
     and refused a toggle that fitted — 2 of 3 used, ticking a category
     computed 4 and showed the limit modal (v55…v62). */
  function _domTeamCount(container, exceptRow) {
    var n = 0;
    container.querySelectorAll('.ts-cat-row').forEach(function (row) {
      if (row === exceptRow) return;
      var box = row.querySelector('input[type="checkbox"]');
      if (!box || !box.checked) return;
      n += row.querySelectorAll('.ts-letter-chip').length;
    });
    return n;
  }

  /* Show the allowance and mute the + buttons at the cap.
     Muted, deliberately NOT disabled: a disabled button fires no click, so
     the modal explaining WHY would never appear. */
  function _refreshTeamSetupQuota() {
    var container = document.getElementById('team-setup-categories');
    if (!container) return;
    var used = _domTeamCount(container);
    var max = clubMaxTeams();
    var banner = document.getElementById('ts-quota-banner');
    if (banner) {
      // Uses the SAVED count, not the DOM one: the lead is over quota
      // because of what the club currently has, and the message must not
      // vanish the moment they tick a box.
      var over = isClubOverQuota();
      banner.hidden = !over;
      if (over) banner.textContent = t('quota.over_lead');
    }
    var el = document.getElementById('ts-quota-counter');
    if (el) {
      el.textContent = t('quota.counter').replace('{n}', used).replace('{max}', max);
      el.classList.toggle('ts-quota-full', used >= max);
    }
    container.querySelectorAll('.ts-letter-add').forEach(function (b) {
      b.classList.toggle('ts-letter-add-muted', used >= max);
    });
  }

  /** The owner's message when the club is at its allowance. */
  /* Set by showTeamSetup(); see there for why only one entry point may. */
  var _tsCancellable = false;

  /** Leave the setup screen for Settings, where the lead came from. */
  function _leaveTeamSetup() {
    currentPage = 'settings';
    const session = getSession();
    if (!session) return;
    showView('#view-dashboard');
    renderDashboard(session);
  }

  function _showQuotaBlockedModal() {
    showModal(t('quota.title'), t('quota.add_blocked'), function () {},
      { hideCancel: true, danger: false, confirmLabel: t('common.ok') });
  }

  /**
   * Bind the team-setup handlers ONCE per node.
   *
   * showTeamSetup() calls this on every entry, but the four containers are
   * static elements in index.html — `innerHTML` replaces their children, not
   * the node — so `addEventListener` used to ACCUMULATE. On a second visit
   * one "+" click ran the handler twice: the first added the chip, the
   * second saw the new count and fired the "limit reached" modal. The team
   * WAS added; the error was spurious. Ticking a category could un-tick
   * itself the same way, and "add staff" / "+ Entrenament" added two rows.
   *
   * The save button was already de-duplicated with a comment naming exactly
   * this hazard; the container handlers were missed. Same idea as
   * `content._settingsBound` on the dashboard.
   */
  function _bindTeamSetupEvents(container) {
    if (container._tsBound) return;
    container._tsBound = true;
    // Toggle enable/disable
    container.addEventListener('change', function (e) {
      if (e.target.type === 'checkbox' && e.target.dataset.cat) {
        if (e.target._tsChange === e.timeStamp) return;   // stray re-dispatch
        e.target._tsChange = e.timeStamp;
        var row = e.target.closest('.ts-cat-row');
        if (e.target.checked) {
          /* Enabling a category adds exactly ONE team. A disabled row's
             stored letters mean nothing (nobody is in it), so it comes
             back as a single A — the same rule the first render applies.
             Count everyone ELSE and add that one; counting this row too is
             what made 2-of-3 refuse a third team. */
          if (_domTeamCount(container, row) + 1 > clubMaxTeams()) {
            e.target.checked = false;
            _showQuotaBlockedModal();
            return;
          }
          row.classList.add('active');
          // Repaint: the row is still drawn as disabled — greyed A, no "+".
          _paintLetters(row, ['A'], true);
        } else {
          var savedHere = rosterKeys(_clubConfig).filter(function (k) {
            return k.indexOf(e.target.dataset.cat + '-') === 0;
          });
          if (savedHere.length) {
            // Disabling would silently remove every one of them. Removing the
            // last team of a category disables it on its own.
            e.target.checked = true;
            showModal(t('quota.title'),
              t('team_del.disable_blocked').replace('{teams}', savedHere.join(', ')),
              function () {},
              { hideCancel: true, danger: false, confirmLabel: t('common.ok') });
            return;
          }
          row.classList.remove('active');
          /* Back to the greyed A with no "+". Only UNSAVED letters can be
             lost here — disabling a category that still has saved teams is
             blocked above — and a disabled category's letters are declared
             meaningless anyway, so re-enabling deliberately gives A. */
          _paintLetters(row, ['A'], false);
        }
        _refreshTeamSetupFcf();
        _refreshTeamSetupSchedules();
        _refreshTeamSetupStaff();
        _refreshTeamSetupQuota();
      }
    });
    // Add letter
    container.addEventListener('click', function (e) {
      var addBtn = e.target.closest('.ts-letter-add');
      if (addBtn) {
        /* One physical click dispatched to two listeners carries the SAME
           timeStamp, so this neutralises a stray re-dispatch whatever its
           cause while leaving a genuine second click alone. The bind guard
           is the fix; this is what stops the class of bug being visible
           again if anything else ever double-binds. */
        if (addBtn._tsClick === e.timeStamp) return;
        addBtn._tsClick = e.timeStamp;
        var catKey = addBtn.dataset.cat;
        var lettersEl = container.querySelector('.ts-letters[data-cat="' + catKey + '"]');
        if (_domTeamCount(container) >= clubMaxTeams()) {
          _showQuotaBlockedModal();
          return;
        }
        var existing = Array.from(lettersEl.querySelectorAll('.ts-letter-chip')).map(function (c) { return c.dataset.letter; });
        var next = _nextLetter(existing);
        if (!next) return;
        var chip = document.createElement('span');
        chip.className = 'ts-letter-chip';
        chip.dataset.letter = next;
        chip.dataset.cat = catKey;
        chip.textContent = next;
        lettersEl.insertBefore(chip, addBtn);
        var afterAdd = lettersEl.querySelectorAll('.ts-letter-chip');
        afterAdd.forEach(function (c, i) {
          c.classList.toggle('ts-letter-chip-last', i === afterAdd.length - 1);
          c.classList.toggle('ts-letter-chip-fixed', i !== afterAdd.length - 1);
        });
        _refreshTeamSetupFcf();
        _refreshTeamSetupSchedules();
        _refreshTeamSetupStaff();
        _refreshTeamSetupQuota();
        return;
      }
      var clickedChip = e.target.closest('.ts-letter-chip');
      if (clickedChip) {
        if (clickedChip._tsClick === e.timeStamp) return;   // stray re-dispatch
        clickedChip._tsClick = e.timeStamp;
        var catKey2 = clickedChip.dataset.cat;
        var row2 = clickedChip.closest('.ts-cat-row');

        /* A disabled row shows one greyed A. Clicking it turns the category
           ON, routed through the checkbox's own change handler rather than
           re-implemented here — that handler carries the quota gate and its
           revert, and a second copy is how the two drift apart. */
        if (!row2.classList.contains('active')) {
          var box = row2.querySelector('input[type="checkbox"]');
          if (box && !box.checked) {
            box.checked = true;
            box.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return;
        }

        // Teams are removed from the END, so earlier chips are inert.
        if (!clickedChip.classList.contains('ts-letter-chip-last')) return;

        var lettersEl2 = container.querySelector('.ts-letters[data-cat="' + catKey2 + '"]');
        var chips = lettersEl2.querySelectorAll('.ts-letter-chip');
        var teamKey2 = catKey2 + '-' + clickedChip.dataset.letter;
        /* A team that has been SAVED owns matches, medical records and
           availability, so it can only go through deleteTeam — dropping the
           letter from the config alone would strand all of it and leave
           joinClub still registering people onto a dead team. A chip added a
           moment ago and not yet saved owns nothing, so it just disappears. */
        if (rosterKeys(_clubConfig).indexOf(teamKey2) !== -1) {
          showDeleteTeamModal(catKey2, clickedChip.dataset.letter);
          return;
        }
        if (chips.length <= 1) return; // keep at least 1
        clickedChip.remove();
        // The chip before it is now the last, so the affordance has to move.
        var remaining = lettersEl2.querySelectorAll('.ts-letter-chip');
        remaining.forEach(function (c, i) {
          c.classList.toggle('ts-letter-chip-last', i === remaining.length - 1);
          c.classList.toggle('ts-letter-chip-fixed', i !== remaining.length - 1);
        });
        _refreshTeamSetupFcf();
        _refreshTeamSetupSchedules();
        _refreshTeamSetupStaff();
        _refreshTeamSetupQuota();
      }
    });
    // Staff section: add/remove email rows
    var staffSection = document.getElementById('team-setup-staff-inputs');
    if (staffSection) {
      staffSection.addEventListener('click', function (e) {
        var addBtn = e.target.closest('.ts-add-staff');
        if (addBtn) {
          var list = staffSection.querySelector('.ts-staff-list[data-staff-key="' + addBtn.dataset.staffKey + '"]');
          if (!list) return;
          var nextIdx = list.querySelectorAll('.ts-sched-row').length;
          list.insertAdjacentHTML('beforeend', _buildStaffEmailRow(addBtn.dataset.staffKey, nextIdx, ''));
          var added = list.lastElementChild.querySelector('input');
          if (added) added.focus();
          return;
        }
        var removeBtn = e.target.closest('.ts-remove-staff');
        if (removeBtn) {
          var row = removeBtn.closest('.ts-sched-row');
          var list2 = removeBtn.closest('.ts-staff-list');
          // Unlike training rows, an empty staff list is legitimate — a team
          // may simply have no staff yet. Keep one blank row to type into.
          if (list2 && list2.querySelectorAll('.ts-sched-row').length <= 1) {
            var only = list2.querySelector('input[data-staff-email]');
            if (only) only.value = '';
            return;
          }
          if (row) row.remove();
        }
      });
    }
    // Schedule section: add/remove training rows
    var schedSection = document.getElementById('team-setup-schedule-inputs');
    if (schedSection) {
      schedSection.addEventListener('click', function (e) {
        var addBtn = e.target.closest('.ts-add-training');
        if (addBtn) {
          var schedKey = addBtn.dataset.schedKey;
          var list = schedSection.querySelector('.ts-training-list[data-sched-key="' + schedKey + '"]');
          if (!list) return;
          var nextIdx = list.querySelectorAll('.ts-sched-row').length;
          var dayLabelsI18n = ['day.monday','day.tuesday','day.wednesday','day.thursday','day.friday','day.saturday','day.sunday'];
          var dayOptions = DAY_VALUES.map(function (d, i) {
            return '<option value="' + d + '">' + t(dayLabelsI18n[i]) + '</option>';
          }).join('');
          var rowHtml = _buildTrainingRow(schedKey, nextIdx, { day: '', time: '', location: '' }, dayOptions);
          list.insertAdjacentHTML('beforeend', rowHtml);
          return;
        }
        var removeBtn = e.target.closest('.ts-remove-training');
        if (removeBtn) {
          var row = removeBtn.closest('.ts-sched-row');
          var list2 = removeBtn.closest('.ts-training-list');
          if (list2 && list2.querySelectorAll('.ts-sched-row').length <= 1) return; // keep at least 1
          if (row) row.remove();
        }
      });
      // Auto-format HH:MM on time inputs (24h)
      schedSection.addEventListener('input', function (e) {
        if (!e.target.matches('[data-train-time], [data-home-time]')) return;
        var v = e.target.value.replace(/[^0-9]/g, '');
        if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2, 4);
        if (v.length > 5) v = v.slice(0, 5);
        e.target.value = v;
      });
    }
    // Save button (remove previous listener to avoid duplicates when re-entering wizard)
    var saveBtn = document.getElementById('btn-save-team-setup');
    if (saveBtn) {
      saveBtn.removeEventListener('click', _handleSaveTeamSetup);
      saveBtn.addEventListener('click', _handleSaveTeamSetup);
    }
    var backBtn2 = document.getElementById('btn-back-team-setup');
    if (backBtn2) backBtn2.addEventListener('click', _leaveTeamSetup);
  }

  /**
   * The next team letter: one past the HIGHEST in use, never backfilling.
   *
   * It used to return the lowest unused letter while the chip was appended
   * at the end, so removing B from A,B,C and pressing + gave `A, C, B` —
   * out of order, and persisted that way.
   *
   * Existing gaps are left alone. deleteTeam can legitimately leave ['A','C'],
   * and renaming a letter would break `{category}-{letter}` everywhere it is
   * used as a key — roster docs, users/{uid}.team, fa_matches[].team, every
   * shard join. A saved team is never renumbered; we only stop making NEW
   * gaps.
   */
  function _nextLetter(existing) {
    var alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    var highest = -1;
    (existing || []).forEach(function (l) {
      var i = alpha.indexOf(l);
      if (i > highest) highest = i;
    });
    return (highest + 1 < alpha.length) ? alpha[highest + 1] : null;
  }

  async function _handleSaveTeamSetup() {
    var session = getSession();
    if (!session || !session.teamId) return;
    var container = document.getElementById('team-setup-categories');
    if (!container) return;
    var errEl = document.getElementById('team-setup-error');
    var saveBtn = document.getElementById('btn-save-team-setup');
    // Collect category config
    var categories = {};
    var anyEnabled = false;
    CATEGORY_ORDER.forEach(function (key) {
      var row = container.querySelector('.ts-cat-row[data-cat="' + key + '"]');
      if (!row) return;
      var enabled = row.querySelector('input[type="checkbox"]').checked;
      var letters = Array.from(row.querySelectorAll('.ts-letter-chip')).map(function (c) { return c.dataset.letter; });
      if (!letters.length) letters = ['A'];
      categories[key] = { enabled: enabled, letters: letters };
      if (enabled) anyEnabled = true;
    });
    if (!anyEnabled) {
      errEl.textContent = t('error.need_category');
      errEl.hidden = false;
      return;
    }
    // Collect FCF links
    var fcfLinks = {};
    document.querySelectorAll('#team-setup-fcf-inputs input[data-fcf-key]').forEach(function (inp) {
      var val = inp.value.trim();
      if (val) fcfLinks[inp.dataset.fcfKey] = val;
    });
    var schedules = _collectSchedulesFromDom();
    // Collect staff emails. Validate before touching the network — a typo
    // here means somebody cannot register at all.
    var staffEmails = _collectStaffEmailsFromDom();
    var badEmail = null;
    document.querySelectorAll('#team-setup-staff-inputs input[data-staff-email]').forEach(function (inp) {
      var v = normalizeEmail(inp.value);
      if (v && !isValidEmail(v) && !badEmail) badEmail = v;
    });
    if (badEmail) {
      errEl.textContent = t('error.invalid_email') + ' (' + badEmail + ')';
      errEl.hidden = false;
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = t('auth.saving');
    try {
      /* Through the callable, not updateClub: `maxTeams` is a commercial
         limit, so the count has to be checked somewhere the lead cannot
         reach. firestore.rules refuses `categories` from a client entirely.
         The callable also refreshes everyone's `cats` claim when the enabled
         set changes — without that, enabling a new category leaves the client
         querying a category its own token does not authorise. */
      var setCats = firebase.app().functions('us-central1').httpsCallable('setClubCategories');
      await setCats({ categories: categories, fcfLinks: fcfLinks, schedules: schedules });
      // Roster docs live in their own subcollection, so they are separate
      // writes. Only push the ones that actually changed — every write fires
      // the onRosterWritten trigger, which re-derives members' permissions.
      var storedRosters = (_clubConfig && _clubConfig.rosters) ? _clubConfig.rosters : {};
      await Promise.all(Object.keys(staffEmails).map(function (key) {
        var before = (storedRosters[key] && storedRosters[key].staffEmails) || [];
        var after = staffEmails[key];
        if (before.length === after.length && before.every(function (e, i) { return e === after[i]; })) {
          return Promise.resolve();
        }
        return saveRoster(session.teamId, key, 'staffEmails', after);
      }));
      _clubConfig = await getClub(session.teamId);
      _clubConfig.rosters = await loadRosters(session.teamId, _clubConfig);
      errEl.hidden = true;
      /* Entered from Settings, go back to Settings — the screen behaved
         inconsistently otherwise, dumping the user on the dashboard home on
         save but returning them to Settings on cancel. The forced entries
         still go through navigate(), which re-evaluates their gates. */
      if (_tsCancellable) _leaveTeamSetup();
      else navigate();
    } catch (err) {
      errEl.textContent = 'Error: ' + err.message;
      errEl.hidden = false;
      console.error(err);
    }
    saveBtn.disabled = false;
    saveBtn.textContent = t('auth.save_continue');
  }

  // ---------- Profile Setup ----------
  function showProfileSetup(session) {
    showView('#view-profile-setup');
    $('#setup-name').value = session.name || '';
    const dobInput = $('#setup-dob');
    if (session.dob) {
      const parts = session.dob.split('-');
      dobInput.value = parts[2] + '/' + parts[1] + '/' + parts[0];
      dobInput.dataset.dateIso = session.dob;
    } else {
      dobInput.value = '';
      dobInput.dataset.dateIso = '';
    }
    const preview = $('#profile-pic-preview');
    if (session.profilePic) {
      preview.innerHTML = `<img src="${session.profilePic}" alt="Profile">`;
    } else {
      preview.innerHTML = '<span class="profile-pic-placeholder">📷</span>';
    }
  }

  function handleProfilePicChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert(t('alert.image_too_large'));
      return;
    }
    // Keep the raw File for upload in handleProfileSetup
    const preview = $('#profile-pic-preview');
    preview._pendingFile = file;
    const reader = new FileReader();
    reader.onload = function (ev) {
      const dataUrl = ev.target.result;
      preview.innerHTML = `<img src="${dataUrl}" alt="Profile">`;
      preview.dataset.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  async function handleProfileSetup(e) {
    e.preventDefault();
    const session = getSession();
    if (!session) return;
    const name = $('#setup-name').value.trim();
    if (!name) return;
    const preview = $('#profile-pic-preview');
    let picSrc = session.profilePic || '';

    // Upload profile pic to Firebase Storage if a new file was selected
    if (preview._pendingFile && auth.currentUser) {
      try {
        const ext = preview._pendingFile.name.split('.').pop() || 'jpg';
        const ref = storage.ref('profilePics/' + auth.currentUser.uid + '.' + ext);
        await ref.put(preview._pendingFile);
        picSrc = await ref.getDownloadURL();
        preview._pendingFile = null;
      } catch (err) {
        console.error('Profile pic upload failed:', err);
        // Fall back to dataURL if upload fails
        picSrc = preview.dataset.src || picSrc;
      }
    } else if (preview.dataset.src) {
      picSrc = preview.dataset.src;
    }

    const dobInput = $('#setup-dob');
    const dob = dobInput.dataset.dateIso || dobInput.value || '';
    session.name = name;
    session.profilePic = picSrc;
    session.dob = dob;
    session.profileSetupDone = true;
    // Persist to Firestore + localStorage (handled by setSession)
    setSession(session);
    navigate();
  }

  function showRoleSelection(session) {
    showView('#view-roles');
    // The lead gets the same multi-select as the superadmin: running the club,
    // playing for it and coaching in it are three separate things, and any
    // combination is valid — including neither of the two optional ones.
    const isLead = !!session.isTeamLead;
    if (session.isAdmin || isLead) {
      $('#roles-pick-one').hidden = true;
      $('#roles-admin-pick').hidden = false;
      $('#roles-subtitle').textContent = isLead && !session.isAdmin
        ? t('auth.roles_lead_subtitle') : t('auth.roles_admin_subtitle');
      const leadCard = $('#lead-role-card');
      if (leadCard) leadCard.hidden = !isLead;
      const hint = $('#roles-lead-hint');
      if (hint) hint.hidden = !isLead;
      $('#chk-player').checked = (session.roles || []).includes('player');
      $('#chk-staff').checked = (session.roles || []).includes('staff');
    } else {
      $('#roles-pick-one').hidden = false;
      $('#roles-admin-pick').hidden = true;
      $('#roles-subtitle').textContent = t('auth.roles_subtitle');
    }
  }

  // ---------- Role selection ----------
  function selectRole(role) {
    const session = getSession();
    if (!session) return;
    session.roles = [role];
    persistSessionRoles(session);
    currentPage = '';
    navigate();
  }

  function confirmAdminRoles() {
    const session = getSession();
    if (!session) return;
    const roles = [];
    if ($('#chk-player').checked) roles.push('player');
    if ($('#chk-staff').checked) roles.push('staff');
    // A lead may pick neither: "I only run the club". Their 'lead' role is
    // granted server-side, so roles is never actually empty and they don't
    // land back here. Everyone else must pick something.
    if (session.isTeamLead) {
      roles.push('lead');
    } else if (roles.length === 0) {
      alert(t('alert.select_role'));
      return;
    }
    session.roles = roles;
    persistSessionRoles(session);
    currentPage = '';
    navigate();
  }

  function persistSessionRoles(session) {
    // Persist to Firestore + localStorage (handled by setSession, which no
    // longer writes roles — they are server-owned).
    setSession(session);
    // Keep Auth custom claims in sync, then refresh the token so security
    // rules see the new role immediately. NOTE: for a self-call setRole
    // ignores the roles passed here and re-derives them from the club's
    // roster email lists, so this cannot grant staff.
    try {
      const fn = firebase.app().functions('us-central1').httpsCallable('setRole');
      fn({ uid: session.id, roles: session.roles || [] })
        .then(() => auth.currentUser && auth.currentUser.getIdToken(true))
        .catch(e => console.warn('setRole (self) failed:', e));
    } catch (e) { console.warn('setRole unavailable:', e); }
  }

  // #endregion Navigation, Team Setup & Profile

  // #region Dashboard & Page Router
  // ---------- Dashboard ----------
  let currentPage = '';
  let _pctAnimatedPage = '';
  let _donutAnimatedPage = '';
  let convSelectedMatchId = null;
  let _mdEditingId = null; // tracks which saved match is being edited inline
  let detailMatchId = null;
  let detailMatchFrom = null;
  /* Which session a detail view is showing, BY ID.
     It used to be the date, which two teams in a category can share -- so
     `find(x => x.date === ...)` returned whichever came first and both
     squads opened the same session. The id has always existed on the row
     and is already used for edit and delete; it just never identified. */
  let detailTrainingId = null;

  function buildSidebarItems(session) {
    const items = [];
    const roles = session.roles || [];

    if (roles.includes('player')) {
      items.push({ section: t('sidebar.section_player') });
      items.push({ id: 'player-home', icon: '🏠', label: t('sidebar.player_home') });
      items.push({ id: 'training', icon: '<img src="img/icon-cone.svg" class="sidebar-img-icon">', label: t('sidebar.training') });
      items.push({ id: 'my-stats', icon: '<img src="img/icon-stats.svg" class="sidebar-img-icon">', label: t('sidebar.my_stats') });
      items.push({ id: 'player-matchday', icon: '⚽', label: t('sidebar.player_matchday') });
      items.push({ id: 'player-actions', icon: '🔔', label: t('sidebar.player_actions') });
    }

    // Over quota, a plain staff member gets no staff pages at all — the club
    // needs its lead to resolve it, and there is nothing useful they can do
    // meanwhile. A staff+player keeps the player section below.
    if (roles.includes('staff') &&
        !(isClubOverQuota() && !session.isAdmin && !session.isTeamLead)) {
      items.push({ section: t('sidebar.section_staff') });
      items.push({ id: 'staff-home', icon: '🏠', label: t('sidebar.staff_home') });
      items.push({ id: 'registrations', icon: '📝', label: t('sidebar.registrations') });
      items.push({ id: 'manage-roster', icon: '<img src="img/icon-boot.png" class="sidebar-img-icon">', label: t('sidebar.manage_roster') });
      items.push({ id: 'staff-training', icon: '<img src="img/icon-cone.svg" class="sidebar-img-icon">', label: t('sidebar.staff_training') });
      items.push({ id: 'matchday', icon: '📅', label: t('sidebar.matchday') });
      items.push({ id: 'convocatoria', icon: '📋', label: t('sidebar.convocatoria') });
      items.push({ id: 'staff-matchday', icon: '⚽', label: t('sidebar.staff_matchday') });
      items.push({ id: 'medical', icon: '<img src="img/icon-medical.svg" class="sidebar-img-icon">', label: t('sidebar.medical') });
      items.push({ id: 'tactics', icon: '📐', label: t('sidebar.tactics') });
      items.push({ id: 'staff-notifications', icon: '🔔', label: t('sidebar.notifications') });
    }

    if (session.isAdmin) {
      items.push({ section: t('sidebar.section_admin') });
      items.push({ id: 'users', icon: '⚙️', label: t('sidebar.users') });
      items.push({ id: 'settings', icon: '🔧', label: t('sidebar.settings') });
    } else if (session.isTeamLead) {
      // The lead manages their own club's members, including permanent
      // deletion — the page reads this club's roster, so it can only ever
      // show and act on their own people.
      items.push({ section: t('sidebar.section_teamlead') });
      items.push({ id: 'users', icon: '⚙️', label: t('sidebar.users') });
      items.push({ id: 'settings', icon: '🔧', label: t('sidebar.settings') });
    }

    return items;
  }

  function renderDashboard(session) {
    migrateInjuryData();
    const navUserEl = $('#nav-user-name');
    if (session.profilePic) {
      navUserEl.innerHTML = `<img src="${session.profilePic}" class="nav-avatar" alt=""> ${sanitize(session.name)}`;
    } else {
      navUserEl.textContent = session.name;
    }

    // Dynamic badge / app name from club config
    var logoEl = document.querySelector('.topnav-logo');
    if (logoEl) {
      var badgeUrl = _clubConfig && _clubConfig.badgeUrl ? _clubConfig.badgeUrl : 'img/logo.png';
      var clubName = _clubConfig && _clubConfig.name ? _clubConfig.name : 'EsquerrApp';
      logoEl.innerHTML = '<img src="' + sanitize(badgeUrl) + '" alt="Logo" class="topnav-logo-img"> <span class="topnav-logo-text">' + sanitize(clubName) + '</span>';
    }

    const badges = [];
    if (session.isAdmin) badges.push('admin');
    (session.roles || []).forEach(r => badges.push(r));
    $('#nav-user-badges').innerHTML = badges.map(b =>
      `<span class="nav-badge">${sanitize(b)}</span>`
    ).join(' ');

    renderSidebar(session);
    renderPage(session);
  }

  function renderSidebar(session) {
    const items = buildSidebarItems(session);
    const pageIds = items.filter(i => !i.section).map(i => i.id);
    if (!pageIds.includes(currentPage)) {
      currentPage = pageIds[0] || '';
    }

    let html = '';
    items.forEach(item => {
      if (item.section) {
        html += `<div class="sidebar-section">${item.section}</div>`;
      } else {
        let badge = '';
        if (item.id === 'player-actions') {
          const pc = getPendingActionCount();
          if (pc > 0) badge = `<span class="sidebar-badge">${pc}</span>`;
        }
        if (item.id === 'staff-notifications') {
          const nc = getUnreadStaffNotifCount();
          if (nc > 0) badge = `<span class="sidebar-badge">${nc}</span>`;
        }
        html += `<div class="sidebar-item ${item.id === currentPage ? 'active' : ''}" data-page="${item.id}">
          <span class="sidebar-icon">${item.icon}</span><span>${item.label}</span>${badge}
        </div>`;
      }
    });
    $('#sidebar').innerHTML = html;

    $$('.sidebar-item').forEach(el => {
      el.addEventListener('click', () => {
        currentPage = el.dataset.page;
        // Close sidebar on mobile
        const sb = document.getElementById('sidebar');
        if (sb) sb.classList.remove('open');
        const ov = document.getElementById('sidebar-overlay');
        if (ov) ov.classList.remove('open');
        // Update active class without rebuilding sidebar
        $$('.sidebar-item').forEach(s => s.classList.toggle('active', s.dataset.page === currentPage));
        renderPage(getSession());
      });
    });
  }

  // ---------- Page renderers ----------
  function updateActionsBadge() {
    const pc = getPendingActionCount();
    const el = document.querySelector('.sidebar-item[data-page="player-actions"] .sidebar-badge');
    if (el) {
      if (pc > 0) { el.textContent = pc; }
      else { el.remove(); }
    } else if (pc > 0) {
      const item = document.querySelector('.sidebar-item[data-page="player-actions"]');
      if (item) item.insertAdjacentHTML('beforeend', `<span class="sidebar-badge">${pc}</span>`);
    }
  }

  // Pages that require a specific role
  const STAFF_PAGES = new Set([
    'staff-home',
    'staff-training', 'staff-training-detail', 'matchday',
    'convocatoria', 'staff-matchday', 'tactics',
    'manage-roster', 'registrations', 'staff-notifications',
    'staff-player-stats', 'medical', 'medical-detail'
  ]);
  const ADMIN_PAGES = new Set(['users']);
  const LEAD_PAGES  = new Set(['settings']);

  /* The page we were on before this one, and the page last rendered.
     Every navigation funnels through renderPage(), so tracking it here
     costs one place instead of the dozen call sites that set currentPage. */
  let _prevPage = null;
  let _lastRendered = null;

  /**
   * Where a detail page's Back button should go.
   *
   * Detail pages used to hardcode a single destination — training detail
   * always returned to the training LIST — so arriving from anywhere else
   * dumped you on a page you had never visited, with the sidebar still
   * highlighting where you actually came from. Returning to the origin is
   * what the highlight was already claiming.
   */
  function backTarget(fallback) {
    return (_prevPage && _prevPage !== currentPage) ? _prevPage : fallback;
  }

  /**
   * Record the move, and answer the one question three things depend on:
   * was this a NAVIGATION, or a re-render of the page we are already on?
   *
   * renderPage() has ~70 callers and only about twenty of them change
   * `currentPage`. The rest re-render in place — the debounced firestore
   * sync, the category bar, the language switch, and every optimistic
   * redraw after a write. Back target, sidebar highlight and the scroll
   * reset all hang off this distinction, so it lives in ONE function: a
   * second copy is how two of them end up disagreeing.
   */
  function trackNavigation(page) {
    const isNav = _lastRendered !== page;
    if (_lastRendered && isNav) _prevPage = _lastRendered;
    _lastRendered = page;
    return isNav;
  }

  /**
   * Keep the sidebar highlight honest.
   *
   * `active` was only ever set when the sidebar was rebuilt or when a
   * sidebar item itself was clicked, so ANY in-page navigation — a row
   * link, a Back button — left it pointing at the previous page. Detail
   * pages are not sidebar items, so they highlight the section they were
   * opened from, which is the convention and is now also where Back goes.
   */
  function syncSidebarActive() {
    const items = $$('.sidebar-item');
    if (!items.length) return;
    const ids = new Set([...items].map(el => el.dataset.page));
    const want = ids.has(currentPage) ? currentPage
      : (ids.has(_prevPage) ? _prevPage : null);
    items.forEach(el => el.classList.toggle('active', el.dataset.page === want));
  }

  function renderPage(session) {
    const content = $('#dashboard-content');
    const roles = session.roles || [];

    // Where to send someone who lands on a page they may not see. A lead who
    // is neither player nor staff has no player-home and no registrations —
    // settings is the only page they have, so it is the last resort.
    const fallbackPage = () =>
      roles.includes('staff') ? 'staff-home' :
        roles.includes('player') ? 'player-home' :
          (session.isAdmin || session.isTeamLead) ? 'settings' : 'player-home';

    // Enforce role access
    if (STAFF_PAGES.has(currentPage) && !roles.includes('staff')) {
      currentPage = fallbackPage();
    }
    // The users page is open to the club's lead as well as the superadmin:
    // a lead must be able to remove someone from their own club without
    // going through the superuser.
    if (ADMIN_PAGES.has(currentPage) && !session.isAdmin && !session.isTeamLead) {
      currentPage = fallbackPage();
    }
    if (LEAD_PAGES.has(currentPage) && !session.isAdmin && !session.isTeamLead) {
      currentPage = fallbackPage();
    }

    // Recorded AFTER the role checks above, which can redirect: the page we
    // came from is the one that actually rendered, not the one requested.
    // A re-render of the same page (a firestore sync, a category switch) is
    // not a navigation and must not overwrite the origin.
    const isNav = trackNavigation(currentPage);

    const renderers = {
      'staff-home': renderStaffHome,
      'player-home': renderPlayerHome,
      'match-detail': renderMatchDetail,
      'training-detail': renderTrainingDetail,
      'training': renderTraining,
      'my-stats': renderPlayerStats,
      'player-actions': renderPlayerActions,
      'player-matchday': renderMatches,
      'staff-training': renderStaffTraining,
      'staff-training-detail': renderStaffTrainingDetail,
      'matchday': renderMatchday,
      'convocatoria': renderConvocatoria,
      'staff-matchday': renderMatches,
      'tactics': renderTactics,
      'manage-roster': renderStaffRoster,
      'staff-player-stats': renderStaffPlayerStats,
      'registrations': renderRegistrations,
      'staff-notifications': renderStaffNotifications,
      'medical': renderMedical,
      'medical-detail': renderMedicalDetail,
      'users': renderAdminUsers,
      'settings': renderAdminSettings,
      'archived-seasons': renderArchivedSeasons,
      'archived-season-detail': renderArchivedSeasonDetail,
    };

    /* Over quota. `currentPage === ''` is load-bearing: a staff-ONLY member
       now has an empty sidebar, so renderSidebar sets currentPage to '' and
       without this arm they would land on "page not found" instead of the
       explanation. */
    if (isClubOverQuota() && !session.isAdmin && !session.isTeamLead &&
        (currentPage === '' || STAFF_PAGES.has(currentPage))) {
      content.innerHTML = '<div class="empty-state"><div class="empty-icon">🔒</div><p>' +
        t('quota.over_staff') + '</p></div>';
      syncSidebarActive();
      bindDynamicActions();
      return;
    }

    // A staff member whose address is on no team's staff list has no
    // categories, so every staff page would render empty. Say why instead.
    if (STAFF_PAGES.has(currentPage) && roles.includes('staff') &&
        !session.isAdmin && !session.isTeamLead &&
        !getVisibleCategories().length) {
      content.innerHTML = '<div class="empty-state"><div class="empty-icon">🔒</div><p>' +
        t('error.no_categories') + '</p></div>';
      syncSidebarActive();
      bindDynamicActions();
      return;
    }

    const fn = renderers[currentPage];
    if (fn) {
      // Pages that scope their content to the selected category.
      // 'tactics' is deliberately absent: its boards are club-wide drawings
      // with no category dimension, so a bar there would imply a filter that
      // does nothing.
      /* Pages that scope their content to the selected category.
         'tactics' is deliberately absent: its boards are club-wide drawings
         with no category dimension, so a bar there would imply a filter that
         does nothing.
         'staff-training-detail' is absent for a different reason — a session
         now belongs to specific teams, so it IS one category by definition.
         Offering a switcher there invited a coach to change the category out
         from under a session he was already looking at. */
      var CATEGORY_PAGES = new Set(['staff-home', 'registrations', 'staff-training', 'matchday', 'convocatoria', 'staff-matchday', 'manage-roster', 'medical', 'player-matchday', 'training', 'player-home', 'player-actions']);
      var catBar = CATEGORY_PAGES.has(currentPage) ? renderCategoryBar() : '';
      content.innerHTML = renderUpdateBanner() + catBar + fn(session);
    } else {
      content.innerHTML = '<div class="empty-state"><div class="empty-icon">🚧</div><p>' + t('empty.page_not_found') + '</p></div>';
    }

    /* A new page starts at the top. #view-dashboard is a fixed shell, so the
       window never scrolls here — .dashboard-content is the scroller, and
       replacing its innerHTML leaves its scrollTop exactly where it was.
       Opening a player from the foot of the roster used to drop you halfway
       down his profile.

       Guarded by isNav, and that guard is the point: an unconditional reset
       would jerk a coach back to the top every time a firestore sync
       redrew the page underneath him. Only 0 is assigned, which is valid at
       any content height, so this needs no layout pass.

       Nested scrollers are deliberately left alone — .rpe-chart-scroll ends
       at the right, scrollLeagueToCentre() centres the club's row, and
       .pmt-scroll is a bounded box. All are different elements. */
    if (isNav) content.scrollTop = 0;

    syncSidebarActive();
    bindDynamicActions();

    // Auto-scroll league tables so Esquerra is vertically centered
    if (currentPage === 'player-home') {
      requestAnimationFrame(function() { requestAnimationFrame(function() {
        scrollLeagueToCentre();
      }); });
      // Live-refresh league data from FCF
      refreshLeagueTables();
    }

    // Injury description hover → body map popup + medical tab bindings
    if (currentPage === 'medical') bindMedical();
    if (currentPage === 'medical-detail') bindMedicalDetail();
    if (currentPage === 'my-stats' || currentPage === 'staff-player-stats') bindMyStatsInjuryPopup();

    // Scroll RPE and UA charts to the right (most recent) by default
    content.querySelectorAll('.rpe-chart-scroll').forEach(el => { el.scrollLeft = el.scrollWidth; });

    // Ensure RO board proportional scaling after layout
    requestAnimationFrame(() => requestAnimationFrame(() => scaleRoBoards()));
  }

  // #endregion Dashboard & Page Router

  // #region Player Pages & Actions
  // POS_COLORS, POS_ORDER, posRankGlobal, posCirclesHtmlGlobal → utils.js

  function getPendingActionCount() {
    const session = getSession();
    if (!session) return 0;
    const now = new Date();
    /* Only the sessions this player is actually called to. This used to read
       the WHOLE club's calendar with no filter at all -- a juvenil player's
       page listed amateur sessions and let him answer availability for them
       -- and it is the same helper that makes a guest see the session he was
       borrowed for. Narrowing and the new feature are one change. */
    const training = playerTrainings(session, getTrainings());
    const matches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
    const rpeData = JSON.parse(localStorage.getItem('fa_player_rpe') || '{}');
    const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
    const staffOverrides = JSON.parse(localStorage.getItem('fa_training_staff_override') || '{}');
    const matchAvailData = JSON.parse(localStorage.getItem('fa_match_availability') || '{}');
    const sentData = JSON.parse(localStorage.getItem('fa_convocatoria_sent') || '{}');
    const completedTraining = training.filter(t => {
      if (!t.date || !t.time) return false;
      const start = new Date(t.date + 'T' + t.time.split(' - ')[0] + ':00');
      return now >= new Date(start.getTime() + 90 * 60 * 1000);
    }).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
    const pt = completedTraining.filter(t => {
      const eff = readRecord(staffOverrides, session.id, t, 'avail') ||
        readRecord(availData, session.id, t, 'avail') || '';
      if (eff === 'no' || eff === 'injured') return false;
      return !readRecord(rpeData, session.id, t, 'rpe');
    }).length;
    const pm = matches.filter(m => {
      if (!m.date || !m.time) return false;
      const start = new Date(m.date + 'T' + m.time + ':00');
      if (now < new Date(start.getTime() + 105 * 60 * 1000)) return false;
      return !rpeData[session.id + '_match_' + m.id];
    }).length;
    const todayStr = now.toISOString().slice(0, 10);
    const ma = matches.filter(m => {
      if (!m.date) return false;
      if (m.date < todayStr) return false;
      if (sentData[m.id]) return false;
      return !matchAvailData[session.id + '_' + m.id];
    }).length;
    return pt + pm + ma;
  }

  function renderPlayerActions() {
    const session = getSession();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    /* Only the sessions this player is actually called to. This used to read
       the WHOLE club's calendar with no filter at all -- a juvenil player's
       page listed amateur sessions and let him answer availability for them
       -- and it is the same helper that makes a guest see the session he was
       borrowed for. Narrowing and the new feature are one change. */
    const training = playerTrainings(session, getTrainings());
    const matches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
    const rpeData = JSON.parse(localStorage.getItem('fa_player_rpe') || '{}');
    const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
    const staffOverrides = JSON.parse(localStorage.getItem('fa_training_staff_override') || '{}');
    const matchAvailData = JSON.parse(localStorage.getItem('fa_match_availability') || '{}');
    const sentData = JSON.parse(localStorage.getItem('fa_convocatoria_sent') || '{}');

    // Pending training: last 5 completed sessions (1.5h / 90min after start)
    const completedTraining = training.filter(t => {
      if (!t.date || !t.time) return false;
      const start = new Date(t.date + 'T' + t.time.split(' - ')[0] + ':00');
      return now >= new Date(start.getTime() + 90 * 60 * 1000);
    }).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);

    const pendingTraining = completedTraining.filter(t => {
      const eff = readRecord(staffOverrides, session.id, t, 'avail') ||
        readRecord(availData, session.id, t, 'avail') || '';
      if (eff === 'no' || eff === 'injured') return false;
      return !readRecord(rpeData, session.id, t, 'rpe');
    });

    // Pending matches: 1h45 (105min) after kickoff
    const pendingMatches = matches.filter(m => {
      if (!m.date || !m.time) return false;
      const start = new Date(m.date + 'T' + m.time + ':00');
      const readyAt = new Date(start.getTime() + 105 * 60 * 1000);
      if (now < readyAt) return false;
      const key = session.id + '_match_' + m.id;
      return !rpeData[key];
    });

    // Pending match availability: future, conv not sent, no answer yet
    const pendingMatchAvail = matches.filter(m => {
      if (!m.date) return false;
      if (m.date < todayStr) return false;
      if (sentData[m.id]) return false;
      return !matchAvailData[session.id + '_' + m.id];
    }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    // Extra trainings already logged
    const extras = Object.keys(rpeData)
      .filter(k => k.startsWith(session.id + '_extra_'))
      .map(k => rpeData[k]);

    let pendingHtml = '';
    pendingTraining.forEach(tr => {
      pendingHtml += `<div class="action-card" data-action-type="training" data-action-key="${sanitize(recordKey(session.id, tr, 'rpe'))}">
        <div class="action-header"><span class="badge badge-green">${t('activity.badge_training')}</span><span class="action-date">${tDayDDMM(tr.date)} · ${tr.time}</span></div>
        <div class="action-label">${sanitize(tr.focus || t('activity.badge_training'))}</div>
        <div class="action-form">
          <div class="action-field"><label data-tooltip="${t('actions.rpe_tooltip')}">${t('actions.rpe')}</label><input type="text" inputmode="numeric" class="reg-input action-rpe" maxlength="2"></div>
          <div class="action-field"><label>${t('actions.minutes')}</label><input type="text" inputmode="numeric" class="reg-input action-minutes" maxlength="3"></div>
          <button class="btn btn-primary btn-small action-submit">${t('btn.submit')}</button>
        </div>
      </div>`;
    });
    pendingMatches.forEach(m => {
      pendingHtml += `<div class="action-card" data-action-type="match" data-action-key="${session.id}_match_${m.id}">
        <div class="action-header"><span class="badge badge-yellow">${t('activity.badge_match')}</span><span class="action-date">${tDayDDMM(m.date)} · ${m.time}</span></div>
        <div class="action-label">${matchLabel(m)}</div>
        <div class="action-form">
          <div class="action-field"><label data-tooltip="${t('actions.rpe_tooltip')}">${t('actions.rpe')}</label><input type="text" inputmode="numeric" class="reg-input action-rpe" maxlength="2"></div>
          <div class="action-field"><label>${t('actions.minutes')}</label><input type="text" inputmode="numeric" class="reg-input action-minutes" maxlength="3"></div>
          <button class="btn btn-primary btn-small action-submit">${t('btn.submit')}</button>
        </div>
      </div>`;
    });

    // Availability cards for matches
    pendingMatchAvail.forEach(m => {
      pendingHtml += `<div class="action-card action-avail-card" data-avail-type="match" data-mavail-match="${m.id}">
        <div class="action-header"><span class="badge badge-yellow">${t('activity.badge_match')}</span><span class="action-date">${tDayDDMM(m.date)} · ${m.time || ''}</span></div>
        <div class="action-label">${matchLabel(m)}</div>
        <div class="action-avail-prompt">${t('actions.availability')}</div>
        <div class="mavail-btns" data-mavail-match="${m.id}">
          <button class="mavail-btn mavail-disp" data-mavail="disponible">${t('avail.disponible')}</button>
          <button class="mavail-btn mavail-nodisp" data-mavail="no_disponible">${t('avail.no_disponible')}</button>
        </div>
      </div>`;
    });

    if (!pendingHtml) pendingHtml = '<p style="color:var(--text-secondary)">' + t('actions.no_pending') + '</p>';
    const pendingCount = pendingTraining.length + pendingMatches.length + pendingMatchAvail.length;

    return `
      <h2 class="page-title">${t('page.actions')}</h2>
      <div class="card">
        <div class="card-title">${t('actions.pending')}${pendingCount ? ' (' + pendingCount + ')' : ''}</div>
        ${pendingHtml}
      </div>
      <div class="card">
        <div class="card-title">${t('actions.extra_training')}</div>
        <div id="extra-training-list"></div>
        <button class="btn btn-outline btn-small" id="btn-add-extra" style="margin-top:.75rem;">${t('actions.add_extra')}</button>
      </div>`;
  }

  // #endregion Player Pages & Actions

  // #region FCF League Scraper
  /* ---------- Live FCF league scraper ---------- */
  var ESQUERRA_NEEDLE_DEFAULT = "esquerra";

  function getActiveFcfLeagues() {
    // No hardcoded fallback: clubs without configured FCF links simply
    // show no standings (a lead sets them up in Team Setup).
    if (!_clubConfig) return [];
    if (!_clubConfig.fcfLinks || !Object.keys(_clubConfig.fcfLinks).length) return [];
    var links = _clubConfig.fcfLinks;
    var cats = _clubConfig.categories || {};
    var keys = Object.keys(links);
    var curCat = getCurrentCategory();
    var leagues = [];
    keys.forEach(function (key) {
      // key format: "amateur-A"
      var parts = key.split('-');
      var cat = parts[0] || '';
      var letter = parts.slice(1).join('-') || '';
      if (curCat && cat !== curCat) return;
      // Only include if this category+letter is actually enabled in club config
      var catCfg = cats[cat];
      if (!catCfg || !catCfg.enabled) return;
      if (catCfg.letters && catCfg.letters.indexOf(letter) === -1) return;
      var label = (CATEGORY_LABELS[cat] || cat) + ' ' + letter;
      leagues.push({ id: 'league-' + key, title: label, url: links[key] });
    });
    // Sort alphabetically by title
    leagues.sort(function (a, b) { return a.title.localeCompare(b.title); });
    return leagues;
  }

  function getClubNeedle() {
    if (_clubConfig && _clubConfig.name) return _clubConfig.name.toLowerCase();
    return ESQUERRA_NEEDLE_DEFAULT;
  }

  function scrollLeagueToCentre() {
    document.querySelectorAll('.league-scroll').forEach(function(el) {
      var row = el.querySelector('.league-ours');
      if (!row) return;
      var thead = el.querySelector('thead');
      var headerH = thead ? thead.getBoundingClientRect().height : 0;
      var cRect = el.getBoundingClientRect();
      var rRect = row.getBoundingClientRect();
      var visibleH = cRect.height - headerH;
      var scrollOffset = rRect.top - cRect.top + el.scrollTop - headerH;
      el.scrollTop = Math.max(0, scrollOffset - (visibleH / 2) + (rRect.height / 2));
    });
  }

  function parseFcfHtml(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var trs = doc.querySelectorAll('table.fcftable-e tbody tr');
    var rows = [];
    trs.forEach(function(tr) {
      var allTds = tr.querySelectorAll('td');
      if (allTds.length < 10) return;
      // Filter to visible-only cells (exclude detallada / display:none)
      var vis = [];
      allTds.forEach(function(td) {
        if (td.style.display === 'none') return;
        if (td.classList.contains('detallada')) return;
        vis.push(td);
      });
      if (vis.length < 8) return;
      // vis[0]=Pos  vis[1]=Badge  vis[2]=Club  vis[3]=Pts  ...  vis[end-4]=F  vis[end-3]=C
      var posCell = vis[0];
      var zone = '';
      var ascSpan = posCell.querySelector('span.ascens');
      if (ascSpan && ascSpan.style.backgroundColor) zone = ascSpan.style.backgroundColor;
      var pos = parseInt(posCell.textContent.trim(), 10) || 0;
      // badge
      var img = vis[1].querySelector('img');
      var badge = img ? img.getAttribute('src') : '';
      if (badge && badge.indexOf('escutbase') !== -1) badge = '';
      // club name from resumida cell
      var clubTd = vis[2];
      var anchor = clubTd.querySelector('a');
      var club = anchor ? anchor.textContent.trim() : clubTd.textContent.trim();
      // pts
      var pts = parseInt(vis[3].textContent.trim(), 10) || 0;
      // F and C are always 4th and 3rd from end of visible cells (before Últims + Sanció)
      var gf = parseInt(vis[vis.length - 4].textContent.trim(), 10) || 0;
      var gc = parseInt(vis[vis.length - 3].textContent.trim(), 10) || 0;
      // J: first resumida numeric cell after pts (skip Coef/Provisional if present)
      var j = 0;
      for (var k = 4; k < vis.length - 4; k++) {
        var val = parseInt(vis[k].textContent.trim(), 10);
        if (!isNaN(val) && vis[k].classList.contains('resumida')) { j = val; break; }
      }
      var ours = club.toLowerCase().indexOf(getClubNeedle()) !== -1;
      rows.push({ pos: pos, club: club, pts: pts, j: j, f: gf, c: gc, badge: badge, zone: zone, ours: ours });
    });
    return rows;
  }

  var _leagueLastFetch = 0;
  var LEAGUE_CACHE_MS = 5 * 60 * 1000; // 5 minutes
  var _leagueCache = JSON.parse(localStorage.getItem('fa_league_cache') || '{}');
  var _leagueCacheTime = parseInt(localStorage.getItem('fa_league_cache_t') || '0', 10);
  var FCF_PROXY_BASE = 'https://fcfclassificacio-674dkdzfja-uc.a.run.app?url=';

  function fetchFcfPage(url) {
    return fetch(FCF_PROXY_BASE + encodeURIComponent(url))
      .then(function(r) { if (!r.ok) throw new Error(r.status); return r.text(); });
  }

  function applyLeagueRows(container, rows) {
    if (rows.length === 0) return;
    var tbody = '';
    rows.forEach(function(r) {
      var cls = r.ours ? ' class="league-ours"' : '';
      var badgeHtml = r.badge ? '<img src="' + r.badge + '" class="league-badge" onerror="this.style.display=\'none\'">' : '';
      var zoneBar = r.zone ? '<span class="league-zone" style="background:' + r.zone + '"></span>' : '';
      tbody += '<tr' + cls + '><td class="league-pos-cell">' + zoneBar + r.pos + '</td><td class="league-badge-cell">' + badgeHtml + '</td><td class="league-club">' + sanitize(r.club) + '</td><td><strong>' + r.pts + '</strong></td><td>' + r.j + '</td><td>' + r.f + '</td><td>' + r.c + '</td></tr>';
    });
    container.querySelector('tbody').innerHTML = tbody;
    requestAnimationFrame(function() { scrollLeagueToCentre(); });
  }

  function refreshLeagueTables() {
    var now = Date.now();
    var needsFetch = now - _leagueCacheTime >= LEAGUE_CACHE_MS;
    getActiveFcfLeagues().forEach(function(league) {
      var container = document.getElementById(league.id);
      if (!container) return;
      // Apply cached rows immediately
      if (_leagueCache[league.id]) {
        applyLeagueRows(container, _leagueCache[league.id]);
      }
      if (!needsFetch) return;
      fetchFcfPage(league.url)
        .then(function(html) {
          var rows = parseFcfHtml(html);
          if (rows.length === 0) return;
          _leagueCache[league.id] = rows;
          try { localStorage.setItem('fa_league_cache', JSON.stringify(_leagueCache)); } catch(e) {}
          // Re-query DOM in case page was re-rendered while fetch was in flight
          var freshContainer = document.getElementById(league.id);
          if (freshContainer) applyLeagueRows(freshContainer, rows);
        })
        .catch(function() { /* keep current data on error */ });
    });
    if (needsFetch) {
      _leagueCacheTime = now;
      try { localStorage.setItem('fa_league_cache_t', String(now)); } catch(e) {}
    }
  }

  function buildLeagueSnippet(title, rows, snippetId) {
    // Use cached live data if available, otherwise fall back to hardcoded rows
    var useRows = _leagueCache[snippetId] || rows;
    var hidden = _getHiddenLeagues();
    var isHidden = hidden.indexOf(snippetId) !== -1;
    var eyeIcon = isHidden ? '👁️‍🗨️' : '👁️';
    var eyeTitle = isHidden ? 'Mostrar classificació' : 'Amagar classificació';
    var html = '<div class="league-snippet card' + (isHidden ? ' league-hidden' : '') + '">';
    html += '<div class="card-title" style="font-size:.82rem;' + (isHidden ? 'margin-bottom:0;' : 'margin-bottom:.5rem;') + 'display:flex;align-items:center;justify-content:space-between;">⚽ ' + sanitize(title) + '<button class="league-toggle-btn" data-league-id="' + snippetId + '" title="' + eyeTitle + '" style="background:none;border:none;cursor:pointer;font-size:1rem;padding:0 .2rem;opacity:.5;">' + eyeIcon + '</button></div>';
    html += '<div class="league-scroll" id="' + snippetId + '"' + (isHidden ? ' style="display:none"' : '') + '><table class="league-tbl"><thead><tr><th>P</th><th></th><th>Club</th><th>Pts</th><th>J</th><th>F</th><th>C</th></tr></thead><tbody>';
    useRows.forEach(function(r) {
      var cls = r.ours ? ' class="league-ours"' : '';
      var badge = r.badge ? '<img src="' + r.badge + '" class="league-badge" onerror="this.style.display=\'none\'">' : '';
      var zoneBar = r.zone ? '<span class="league-zone" style="background:' + r.zone + '"></span>' : '';
      html += '<tr' + cls + '><td class="league-pos-cell">' + zoneBar + r.pos + '</td><td class="league-badge-cell">' + badge + '</td><td class="league-club">' + sanitize(r.club) + '</td><td><strong>' + r.pts + '</strong></td><td>' + r.j + '</td><td>' + r.f + '</td><td>' + r.c + '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '</div>';
    return html;
  }

  function _getHiddenLeagues() {
    try { return JSON.parse(localStorage.getItem('fa_hidden_leagues') || '[]'); } catch (e) { return []; }
  }
  function _setHiddenLeagues(arr) {
    localStorage.setItem('fa_hidden_leagues', JSON.stringify(arr));
  }

  function renderPlayerHome() {
    const session = getSession();
    const picHtml = session.profilePic
      ? `<img src="${session.profilePic}" alt="Profile" class="player-overview-pic">`
      : `<div class="player-overview-pic player-overview-pic-placeholder">${sanitize(session.name).charAt(0).toUpperCase()}</div>`;

    const users = getUsers();
    const userRecord = users.find(u => u.id === session.id);
    const team = (userRecord && userRecord.team) || session.team || '';
    const teamBadge = team
      ? `<span class="po-team-badge">${sanitize(team)}</span>`
      : '';

    const positions = ((userRecord && userRecord.position) || session.position || '').split(',').map(s => s.trim()).filter(Boolean);
    const layoutCls = positions.length === 3 ? 'po-pos-tri' : positions.length === 2 ? 'po-pos-duo' : 'po-pos-one';
    const posCircles = positions.map(p => {
      const bg = POS_COLORS[p] || '#9e9e9e';
      return `<span class="po-pos-circle" style="background:${bg}">${sanitize(p)}</span>`;
    }).join('');

    const number = session.playerNumber || '—';
    const dob = (userRecord && userRecord.dob) || session.dob || '';
    let ageLabel = '';
    if (dob) {
      const bd = new Date(dob + 'T12:00:00');
      const today = new Date();
      let age = today.getFullYear() - bd.getFullYear();
      if (today.getMonth() < bd.getMonth() || (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())) age--;
      ageLabel = ` <span style="color:var(--text-secondary);font-weight:400;font-size:.85em;">(${age} anys)</span>`;
    }

    // Build per-player attendance donut
    /* Only the sessions this player is actually called to. This used to read
       the WHOLE club's calendar with no filter at all -- a juvenil player's
       page listed amateur sessions and let him answer availability for them
       -- and it is the same helper that makes a guest see the session he was
       borrowed for. Narrowing and the new feature are one change. */
    const training = playerTrainings(session, getTrainings());
    let pYes = 0, pLate = 0, pNo = 0, pInj = 0, pNa = 0;
    const _ctxHome = availContext();
    training.forEach(t => {
      if (!t.date) return;
      const locked = isTrainingLocked(t);
      const v = getEffectiveAnswer(session.id, t, locked, _ctxHome);
      if (v === 'yes') pYes++;
      else if (v === 'late') pLate++;
      else if (v === 'no') pNo++;
      else if (v === 'injured') pInj++;
      else pNa++;
    });
    const pTotal = pYes + pLate + pNo + pInj + pNa;
    let attendDonutHtml = '';
    if (pTotal > 0) {
      const dSize = 130, dStroke = 20, dRadius = (dSize - dStroke) / 2;
      const dCirc = 2 * Math.PI * dRadius;
      const dSegs = [
        { count: pYes, color: '#66bb6a', label: 'Yes' },
        { count: pLate, color: '#ffa726', label: 'Late' },
        { count: pNo, color: '#78909c', label: 'No' },
        { count: pInj, color: '#ef5350', label: 'Injured' },
        { count: pNa, color: '#d0d0d0', label: 'N/A' }
      ];
      let dArcs = '', dOff = 0;
      dSegs.forEach(s => {
        if (s.count > 0) {
          const len = (s.count / pTotal) * dCirc;
          const sPct = Math.round((s.count / pTotal) * 100);
          dArcs += `<circle cx="${dSize/2}" cy="${dSize/2}" r="${dRadius}" fill="none" stroke="${s.color}" stroke-width="${dStroke}"
            stroke-dasharray="${len} ${dCirc - len}" stroke-dashoffset="${-dOff}"
            style="--circ:${dCirc};cursor:pointer;pointer-events:stroke" transform="rotate(-90 ${dSize/2} ${dSize/2})" data-tooltip="${s.label}: ${sPct}%"><title>${s.label}: ${sPct}%</title></circle>`;
          dOff += len;
        }
      });
      const attendPct = Math.round(((pYes + pLate) / pTotal) * 100);
      attendDonutHtml = `<div class="po-attendance">
        <div class="assistance-circle" style="width:${dSize}px;height:${dSize}px;">
          <svg width="${dSize}" height="${dSize}" viewBox="0 0 ${dSize} ${dSize}">
            <circle cx="${dSize/2}" cy="${dSize/2}" r="${dRadius}" fill="none" stroke="var(--border)" stroke-width="${dStroke}"/>
            ${dArcs}
          </svg>
          <span class="assistance-pct po-pct-counter" data-target="${attendPct}" style="font-size:1.3rem;font-weight:800;">0%</span>
        </div>
        <span class="po-attendance-label">${t('home.attendance')}</span>
      </div>`;
    }

    return `
      <h2 class="page-title">${sanitize(session.name)} <span style="color:var(--text-secondary);font-weight:600;">#${sanitize(String(number))}</span>${ageLabel}</h2>
      <div class="player-overview-card">
        <div class="player-overview-left">
          <div class="po-pic-wrap" id="po-pic-change" style="cursor:pointer" title="${t('home.change_photo')}">
            ${picHtml}
            ${teamBadge}
          </div>
          <div class="po-pos-wrap ${layoutCls}">${posCircles}</div>
        </div>
        ${attendDonutHtml}
      </div>
      <div class="league-tables-row">
        ${(function() {
          var leagues = getActiveFcfLeagues();
          if (!leagues.length && session && (session.isTeamLead || session.isAdmin)) {
            return '<div class="card" style="color:var(--text-secondary);font-size:.9rem;">Configura els enllaços de classificació FCF a l\'apartat de configuració del club per veure les classificacions aquí.</div>';
          }
          return leagues.map(function(league) {
            var cached = _leagueCache[league.id] || [];
            return buildLeagueSnippet(league.title, cached, league.id);
          }).join('');
        })()}
      </div>
      <div class="card">
        <div class="card-title">${t('home.this_week')}</div>
        ${renderWeekActivities(0)}
      </div>
      <div class="card">
        <div class="card-title">${t('home.next_week')}</div>
        ${renderWeekActivities(1)}
      </div>`;
  }

  // #endregion FCF League Scraper

  // #region Tactical Board Rendering
  // ---- Arrowhead helper — computes polygon arrowheads in pixel space for correct perpendicularity ----
  function refreshArrowheads(svg) {
    if (!svg) return;
    svg.querySelectorAll('.tb-arrowhead').forEach(p => p.remove());
    const rect = svg.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    if (w < 1 || h < 1) return;
    const isRo = !!svg.closest('.tb-field-readonly');
    svg.querySelectorAll('.tb-arrow').forEach(line => {
      // Preserve original endpoints so repeated calls don't accumulate shortening
      if (!line.dataset.origX2) {
        line.dataset.origX2 = line.getAttribute('x2');
        line.dataset.origY2 = line.getAttribute('y2');
      }
      const x1 = parseFloat(line.getAttribute('x1'));
      const y1 = parseFloat(line.getAttribute('y1'));
      const x2 = parseFloat(line.dataset.origX2);
      const y2 = parseFloat(line.dataset.origY2);
      if (isRo) {
        // Pixel-space arrowhead for RO boards — same approach as editor but scaled
        const px1 = x1 * w / 100, py1 = y1 * h / 100;
        const px2 = x2 * w / 100, py2 = y2 * h / 100;
        const dx = px2 - px1, dy = py2 - py1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 2) return;
        const ux = dx / len, uy = dy / len;
        const nx = -uy, ny = ux;
        const scaleFactor = w / 814;
        const aLen = 12 * scaleFactor, aHW = 5 * scaleFactor;
        const bx = px2 - ux * aLen, by = py2 - uy * aLen;
        const lx = bx + nx * aHW, ly = by + ny * aHW;
        const rx = bx - nx * aHW, ry = by - ny * aHW;
        line.setAttribute('x2', (bx * 100 / w) + '%');
        line.setAttribute('y2', (by * 100 / h) + '%');
        const pts = (px2 * 100 / w) + ',' + (py2 * 100 / h) + ' ' +
                    (lx * 100 / w) + ',' + (ly * 100 / h) + ' ' +
                    (rx * 100 / w) + ',' + (ry * 100 / h);
        const color = line.dataset.color || line.getAttribute('stroke') || '#ffffff';
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('class', 'tb-arrowhead');
        poly.setAttribute('points', pts);
        poly.setAttribute('fill', color);
        svg.appendChild(poly);
      } else {
        // Pixel-space arrowhead (editor board)
        const px1 = x1 * w / 100, py1 = y1 * h / 100;
        const px2 = x2 * w / 100, py2 = y2 * h / 100;
        const dx = px2 - px1, dy = py2 - py1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 2) return;
        const ux = dx / len, uy = dy / len;
        const nx = -uy, ny = ux;
        const aLen = 12, aHW = 5;
        const bx = px2 - ux * aLen, by = py2 - uy * aLen;
        const lx = bx + nx * aHW, ly = by + ny * aHW;
        const rx = bx - nx * aHW, ry = by - ny * aHW;
        // Shorten the line so it ends at the arrowhead base (doesn't poke through)
        line.setAttribute('x2', (bx * 100 / w) + '%');
        line.setAttribute('y2', (by * 100 / h) + '%');
        const pts = (px2 * 100 / w) + ',' + (py2 * 100 / h) + ' ' +
                    (lx * 100 / w) + ',' + (ly * 100 / h) + ' ' +
                    (rx * 100 / w) + ',' + (ry * 100 / h);
        const color = line.dataset.color || line.getAttribute('stroke') || '#ffffff';
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('class', 'tb-arrowhead');
        poly.setAttribute('points', pts);
        poly.setAttribute('fill', color);
        svg.appendChild(poly);
      }
    });
  }

  // ---- Read-only board helper (shared by match-detail & convocatòria) ----
  let _roBoardIdx = 0;
  function renderReadOnlyBoard(b, prefix) {
    const bid = 'ro-board-' + (++_roBoardIdx);
    let fCls = 'tb-field tb-field-readonly';
    if (b.boardType === 'half') fCls += ' tb-half';
    else if (b.boardType === 'area') fCls += ' tb-area';
    const tc = b.teamColor || '#ffffff';
    const oc = b.oppColor || '#e53935';
    const hasFrames = b.frames && b.frames.length > 1;
    // Use first frame's state for positions if available, otherwise base board data
    const src = hasFrames ? b.frames[0] : b;

    function buildCircles(pos, nums, colors, baseColor) {
      const GK_C = '#f5c842';
      return (pos || []).map((p, i) => {
        if (!p) return ''; // null = deleted circle slot
        const num = String((nums && nums[i]) || '');
        const isGk = num === '1';
        const cc = isGk ? GK_C : ((colors && colors[i]) || baseColor);
        const fg = textColorFor(cc);
        return '<div class="tb-circle" data-idx="' + i + '" style="left:' + p[0] + '%;top:' + p[1] + '%;pointer-events:none;background:' + cc + ';border-color:' + darkenHex(cc, 50) + ';">' +
          '<span class="tb-num" style="pointer-events:none;display:flex;align-items:center;justify-content:center;color:' + fg + ';">' + sanitize(num) + '</span></div>';
      }).join('');
    }
    const hasRealNums = function(arr) { return arr && arr.some(function(n) { return n; }); };
    const circles = buildCircles(src.positions, (hasRealNums(b.numbers) ? b.numbers : src.numbers), src.colors, tc);
    const oppCircles = (b.showOpp !== false && src.oppPositions) ? buildCircles(src.oppPositions, (hasRealNums(b.oppNumbers) ? b.oppNumbers : src.oppNumbers), null, oc) : '';
    const srcBalls = src.balls || (src.ballPos ? [src.ballPos] : []);
    const ballHtml = srcBalls.map((bp,bi) => { if (!bp) return ''; return '<div class="tb-ball" data-idx="' + bi + '" style="left:' + bp[0] + '%;top:' + bp[1] + '%;pointer-events:none;"></div>'; }).join('');
    function buildSvgContent(arrows, rects, penLines, pfx) {
      const rectsH = (rects && rects.length) ? rects.map(r => '<rect class="tb-rect" x="' + r[0] + '%" y="' + r[1] + '%" width="' + r[2] + '%" height="' + r[3] + '%" style="pointer-events:none;fill:' + (r[4]||'#ffffff') + ';fill-opacity:' + (r[5]!=null?r[5]:0.3) + ';stroke:' + (r[4]||'#ffffff') + ';" />').join('') : '';
      const arrowsH = (arrows && arrows.length) ? (arrows.map(a => { const ac = a[4] || '#ffffff'; const ad = a[5] ? ' stroke-dasharray="6 4"' : ''; return '<line class="tb-arrow" x1="' + a[0] + '%" y1="' + a[1] + '%" x2="' + a[2] + '%" y2="' + a[3] + '%" data-color="' + ac + '" style="pointer-events:none;stroke:' + ac + ';"' + ad + ' />'; }).join('')) : '';
      const penH = (penLines && penLines.length) ? penLines.map(p => '<polyline class="tb-pen-line" points="' + p[0] + '" style="pointer-events:none;fill:none;stroke:' + (p[1]||'#ffffff') + ';stroke-width:2.5;"' + (p[2] ? ' stroke-dasharray="6 4"' : '') + ' />').join('') : '';
      return (rectsH || arrowsH || penH) ? '<svg class="tb-arrows-svg" viewBox="0 0 100 100" preserveAspectRatio="none">' + rectsH + arrowsH + penH + '</svg>' : '';
    }
    // Use base board data for arrows/rects/penLines in static view (always up-to-date at save time)
    const staticArrows = ('arrows' in b) ? b.arrows : (src.arrows || []);
    const staticRects = ('rects' in b) ? b.rects : (src.rects || []);
    const staticPenLines = ('penLines' in b) ? b.penLines : (src.penLines || []);
    const svgHtml = buildSvgContent(staticArrows, staticRects, staticPenLines, prefix + bid + '-');
    const staticTexts = ('texts' in b) ? b.texts : (src.texts || []);
    const textsHtml = staticTexts.map(t => { const c=t[3]||'#000000'; const o=t[4]!=null?t[4]:0.8; const w=t[5]?'width:'+t[5]+'px;':''; const h=t[6]?'height:'+t[6]+'px;':''; const fs=t[7]?'font-size:'+t[7]+'px;':''; return '<div class="tb-text-label" style="left:'+t[0]+'%;top:'+t[1]+'%;pointer-events:none;background:rgba('+parseInt(c.slice(1,3),16)+','+parseInt(c.slice(3,5),16)+','+parseInt(c.slice(5,7),16)+','+o+');color:'+textColorFor(c)+';'+w+h+fs+'">'+sanitize(t[2])+'</div>'; }).join('');
    const playBtnH = hasFrames ? '<button class="tb-ro-play" data-ro-board="' + bid + '" title="Play animation"></button>' : '';
    // Merge base board rects/arrows/numbers into frames that lack them so shapes & numbers persist during animation
    // Numbers are shared across all frames — always prefer base board numbers (b.numbers)
    const baseNums = hasRealNums(b.numbers) ? b.numbers : null;
    const baseOppNums = hasRealNums(b.oppNumbers) ? b.oppNumbers : null;
    const framesForAnim = hasFrames ? b.frames.map(f => ({
      ...f,
      positions: f.positions || b.positions || [],
      oppPositions: ('oppPositions' in f) ? f.oppPositions : (b.oppPositions || null),
      balls: ('balls' in f) ? f.balls : (f.ballPos ? [f.ballPos] : (b.balls || (b.ballPos ? [b.ballPos] : []))),
      colors: ('colors' in f) ? f.colors : (b.colors || null),
      numbers: baseNums || (hasRealNums(f.numbers) ? f.numbers : []),
      oppNumbers: baseOppNums || (hasRealNums(f.oppNumbers) ? f.oppNumbers : []),
      rects: ('rects' in f) ? f.rects : (b.rects || []),
      arrows: ('arrows' in f) ? f.arrows : (b.arrows || []),
      texts: ('texts' in f) ? f.texts : (b.texts || []),
      penLines: ('penLines' in f) ? f.penLines : (b.penLines || []),
      cones: ('cones' in f) ? f.cones : []
    })) : [];
    const framesAttr = hasFrames ? " data-frames='" + sanitize(JSON.stringify(framesForAnim)).replace(/'/g, '&#39;') + "'" : '';
    return '<div style="margin-bottom:1rem;"><div style="font-weight:600;font-size:.92rem;margin-bottom:.4rem;">' + sanitize(b.name) + (b.formation ? ' <span style="color:var(--text-secondary);font-weight:400;">(' + sanitize(b.formation) + ')</span>' : '') + '</div>' +
      '<div class="' + fCls + '" id="' + bid + '"' + framesAttr + ' data-tc="' + tc + '" data-oc="' + oc + '" data-prefix="' + prefix + bid + '-"><div class="tb-field-inner">' +
      '<div class="tb-halfway"></div><div class="tb-center-circle"></div><div class="tb-center-spot"></div>' +
      '<div class="tb-penalty-left"></div><div class="tb-penalty-right"></div>' +
      '<div class="tb-goal-left"></div><div class="tb-goal-right"></div>' +
      '<div class="tb-penalty-arc-left"></div><div class="tb-penalty-arc-right"></div>' +
      '<div class="tb-penalty-spot-left"></div><div class="tb-penalty-spot-right"></div>' +
      circles + oppCircles + ballHtml + svgHtml + textsHtml + playBtnH +
      ((src.cones && src.cones.length) ? src.cones.map(c => '<div class="tb-cone" style="left:' + c[0] + '%;top:' + c[1] + '%;pointer-events:none;"></div>').join('') : '') +
      (b.silhouette ? '<img class="tb-silhouette" src="img/sil-' + b.silhouette + '.png" alt="" style="display:block;pointer-events:none;">' : '') +
      '</div></div></div>';
  }

  function bindRoBoardAnimations() {
    // Compute polygon arrowheads for all read-only boards now that they're in the DOM
    document.querySelectorAll('.tb-field-readonly .tb-arrows-svg').forEach(svg => refreshArrowheads(svg));
    document.querySelectorAll('.tb-ro-play').forEach(btn => {
      btn.addEventListener('click', () => {
        const bid = btn.dataset.roBoard;
        const fieldEl = document.getElementById(bid);
        if (!fieldEl) return;
        const innerEl = fieldEl.querySelector('.tb-field-inner');
        if (!innerEl) return;
        let frames;
        try { frames = JSON.parse(fieldEl.dataset.frames || '[]'); } catch(e) { return; }
        if (frames.length < 2) return;
        const tc = fieldEl.dataset.tc || '#ffffff';
        const oc = fieldEl.dataset.oc || '#e53935';
        const prefix = fieldEl.dataset.prefix || '';

        // If already playing, stop
        if (fieldEl._roPlaying) { fieldEl._roPlaying = false; btn.classList.remove('playing'); return; }
        fieldEl._roPlaying = true;
        btn.classList.add('playing');

        // Apply a frame state to the read-only board
        function applyRoFrame(f) {
          const GK_C = '#f5c842';
          // Circles
          innerEl.querySelectorAll('.tb-circle:not(.tb-circle-opp)').forEach(c => c.remove());
          (f.positions || []).forEach((p, i) => {
            if (!p) return; // null = deleted circle slot
            const num = String((f.numbers && f.numbers[i]) || '');
            const isGk = num === '1';
            const cc = isGk ? GK_C : ((f.colors && f.colors[i]) || tc);
            const div = document.createElement('div');
            div.className = 'tb-circle';
            div.setAttribute('data-idx', i);
            div.style.cssText = 'left:' + p[0] + '%;top:' + p[1] + '%;pointer-events:none;background:' + cc + ';border-color:' + darkenHex(cc, 50) + ';';
            const span = document.createElement('span');
            span.className = 'tb-num';
            span.style.cssText = 'pointer-events:none;display:flex;align-items:center;justify-content:center;color:' + textColorFor(cc) + ';';
            span.textContent = num;
            div.appendChild(span);
            innerEl.appendChild(div);
          });
          // Opp circles
          innerEl.querySelectorAll('.tb-circle-opp').forEach(c => c.remove());
          (f.oppPositions || []).forEach((p, i) => {
            if (!p) return; // null = deleted circle slot
            const num = String((f.oppNumbers && f.oppNumbers[i]) || '');
            const isGk = num === '1';
            const oppBg = isGk ? GK_C : oc;
            const div = document.createElement('div');
            div.className = 'tb-circle tb-circle-opp';
            div.setAttribute('data-idx', i);
            div.style.cssText = 'left:' + p[0] + '%;top:' + p[1] + '%;pointer-events:none;background:' + oppBg + ';border-color:' + darkenHex(oppBg, 50) + ';';
            const span = document.createElement('span');
            span.className = 'tb-num';
            span.style.cssText = 'pointer-events:none;display:flex;align-items:center;justify-content:center;color:' + textColorFor(oppBg) + ';';
            span.textContent = num;
            div.appendChild(span);
            innerEl.appendChild(div);
          });
          // Balls
          innerEl.querySelectorAll('.tb-ball').forEach(b => b.remove());
          const fBalls = f.balls || (f.ballPos ? [f.ballPos] : []);
          fBalls.forEach((bp, bi) => {
            if (!bp) return; // null = deleted ball
            const div = document.createElement('div');
            div.className = 'tb-ball';
            div.setAttribute('data-idx', bi);
            div.style.cssText = 'left:' + bp[0] + '%;top:' + bp[1] + '%;pointer-events:none;';
            innerEl.appendChild(div);
          });
          // Text labels
          innerEl.querySelectorAll('.tb-text-label').forEach(t => t.remove());
          (f.texts || []).forEach(t => {
            const div = document.createElement('div');
            div.className = 'tb-text-label';
            const tc=t[3]||'#000000'; const to2=t[4]!=null?t[4]:0.8;
            div.style.cssText = 'left:'+t[0]+'%;top:'+t[1]+'%;pointer-events:none;background:'+hexToRgba(tc,to2)+';color:'+textColorFor(tc)+';'+(t[5]?'width:'+t[5]+'px;':'')+(t[6]?'height:'+t[6]+'px;':'')+(t[7]?'font-size:'+t[7]+'px;':'');
            div.textContent = t[2];
            innerEl.appendChild(div);
          });
          // SVG
          let svg = innerEl.querySelector('.tb-arrows-svg');
          if (svg) svg.remove();
          const arrows = f.arrows || [];
          const rects = f.rects || [];
          const penLines = f.penLines || [];
          if (arrows.length || rects.length || penLines.length) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'tb-arrows-svg');
            svg.setAttribute('viewBox', '0 0 100 100');
            svg.setAttribute('preserveAspectRatio', 'none');
            // Rects
            rects.forEach(r => {
              const re = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
              re.setAttribute('class', 'tb-rect');
              re.setAttribute('x', r[0] + '%'); re.setAttribute('y', r[1] + '%');
              re.setAttribute('width', r[2] + '%'); re.setAttribute('height', r[3] + '%');
              re.style.cssText = 'pointer-events:none;fill:' + (r[4]||'#fff') + ';fill-opacity:' + (r[5]!=null?r[5]:0.3) + ';stroke:' + (r[4]||'#fff') + ';';
              svg.appendChild(re);
            });
            // Arrow lines
            if (arrows.length) {
              arrows.forEach(a => {
                const ac = a[4]||'#ffffff';
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('class', 'tb-arrow');
                line.setAttribute('x1', a[0]+'%'); line.setAttribute('y1', a[1]+'%');
                line.setAttribute('x2', a[2]+'%'); line.setAttribute('y2', a[3]+'%');
                line.dataset.color = ac;
                line.style.cssText = 'pointer-events:none;stroke:' + ac;
                if (a[5]) line.setAttribute('stroke-dasharray', '6 4');
                svg.appendChild(line);
              });
            }
            // Pen lines
            penLines.forEach(p => {
              const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
              pl.setAttribute('class', 'tb-pen-line');
              pl.setAttribute('points', p[0]);
              pl.style.cssText = 'pointer-events:none;fill:none;stroke:' + (p[1]||'#ffffff') + ';stroke-width:2.5;';
              if (p[2]) pl.setAttribute('stroke-dasharray', '6 4');
              svg.appendChild(pl);
            });
            innerEl.appendChild(svg);
            refreshArrowheads(svg);
          }
          // Cones
          innerEl.querySelectorAll('.tb-cone').forEach(c => c.remove());
          (f.cones || []).forEach(c => {
            const div = document.createElement('div');
            div.className = 'tb-cone';
            div.style.cssText = 'left:' + c[0] + '%;top:' + c[1] + '%;pointer-events:none;';
            innerEl.appendChild(div);
          });
          // Re-apply proportional sizing to new elements
          scaleRoField(innerEl, innerEl.offsetWidth);
        }

        function lerp(a, b, t) { return a + (b - a) * t; }

        function interpolateRo(from, to, t) {
          const GK_C = '#f5c842';

          // --- Team circles: match by stable array index ---
          const fromPos = from.positions || [];
          const toPos = to.positions || [];
          const toNums = to.numbers || [];
          const maxLen = Math.max(fromPos.length, toPos.length);

          // Build a map of existing DOM circles by data-idx
          let circleMap = {};
          innerEl.querySelectorAll('.tb-circle:not(.tb-circle-opp)').forEach(c => {
            circleMap[Number(c.dataset.idx || c.getAttribute('data-idx') || 0)] = c;
          });

          for (let i = 0; i < maxLen; i++) {
            const fP = fromPos[i];
            const tP = toPos[i];
            const circle = circleMap[i];

            if (!tP) {
              if (circle) { circle.remove(); delete circleMap[i]; }
              continue;
            }

            if (!circle) {
              const num = String(toNums[i] || '');
              const isGk = num === '1';
              const cc = isGk ? GK_C : ((to.colors && to.colors[i]) || tc);
              const div = document.createElement('div');
              div.className = 'tb-circle';
              div.setAttribute('data-idx', i);
              div.style.cssText = 'left:' + tP[0] + '%;top:' + tP[1] + '%;pointer-events:none;background:' + cc + ';border-color:' + darkenHex(cc, 50) + ';';
              const span = document.createElement('span');
              span.className = 'tb-num';
              span.style.cssText = 'pointer-events:none;display:flex;align-items:center;justify-content:center;color:' + textColorFor(cc) + ';';
              span.textContent = num;
              div.appendChild(span);
              innerEl.appendChild(div);
              circleMap[i] = div;
              continue;
            }

            if (fP && tP) {
              circle.style.left = lerp(fP[0], tP[0], t) + '%';
              circle.style.top = lerp(fP[1], tP[1], t) + '%';
            } else if (!fP && tP) {
              circle.style.left = tP[0] + '%';
              circle.style.top = tP[1] + '%';
            }
          }

          // --- Opp circles: same stable-index matching ---
          const fromOpp = from.oppPositions || [];
          const toOpp = to.oppPositions || [];
          const toOppNums = to.oppNumbers || [];
          const maxOppLen = Math.max(fromOpp.length, toOpp.length);

          let oppMap = {};
          innerEl.querySelectorAll('.tb-circle-opp').forEach(c => {
            oppMap[Number(c.dataset.idx || c.getAttribute('data-idx') || 0)] = c;
          });

          for (let i = 0; i < maxOppLen; i++) {
            const fP = fromOpp[i];
            const tP = toOpp[i];
            const circle = oppMap[i];

            if (!tP) {
              if (circle) { circle.remove(); delete oppMap[i]; }
              continue;
            }

            if (!circle) {
              const num = String(toOppNums[i] || '');
              const isGk = num === '1';
              const oppBg = isGk ? GK_C : oc;
              const div = document.createElement('div');
              div.className = 'tb-circle tb-circle-opp';
              div.setAttribute('data-idx', i);
              div.style.cssText = 'left:' + tP[0] + '%;top:' + tP[1] + '%;pointer-events:none;background:' + oppBg + ';border-color:' + darkenHex(oppBg, 50) + ';';
              const span = document.createElement('span');
              span.className = 'tb-num';
              span.style.cssText = 'pointer-events:none;display:flex;align-items:center;justify-content:center;color:' + textColorFor(oppBg) + ';';
              span.textContent = num;
              div.appendChild(span);
              innerEl.appendChild(div);
              oppMap[i] = div;
              continue;
            }

            if (fP && tP) {
              circle.style.left = lerp(fP[0], tP[0], t) + '%';
              circle.style.top = lerp(fP[1], tP[1], t) + '%';
            } else if (!fP && tP) {
              circle.style.left = tP[0] + '%';
              circle.style.top = tP[1] + '%';
            }
          }

          // Balls
          const fromBalls = from.balls || [];
          const toBalls = to.balls || [];
          const maxBalls = Math.max(fromBalls.length, toBalls.length);
          let roBallMap = {};
          innerEl.querySelectorAll('.tb-ball').forEach(b => { roBallMap[Number(b.dataset.idx || b.getAttribute('data-idx') || 0)] = b; });
          for (let bi = 0; bi < maxBalls; bi++) {
            const fB = fromBalls[bi];
            const tB = toBalls[bi];
            let ball = roBallMap[bi];
            if (!tB) { if (ball) { ball.remove(); } continue; }
            if (!ball) {
              ball = document.createElement('div');
              ball.className = 'tb-ball';
              ball.setAttribute('data-idx', bi);
              ball.style.cssText = 'left:' + tB[0] + '%;top:' + tB[1] + '%;pointer-events:none;';
              innerEl.appendChild(ball);
              roBallMap[bi] = ball;
              continue;
            }
            if (fB && tB) {
              ball.style.left = lerp(fB[0], tB[0], t) + '%';
              ball.style.top = lerp(fB[1], tB[1], t) + '%';
            } else if (!fB && tB) {
              ball.style.left = tB[0] + '%';
              ball.style.top = tB[1] + '%';
            }
          }
          // Arrows — snap to target frame at t=0
          const tArr = to.arrows || [];
          let svg = innerEl.querySelector('.tb-arrows-svg');
          if (!svg && tArr.length) {
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'tb-arrows-svg');
            svg.setAttribute('viewBox', '0 0 100 100');
            svg.setAttribute('preserveAspectRatio', 'none');
            innerEl.appendChild(svg);
          }
          if (svg) {
            const curArrows = svg.querySelectorAll('.tb-arrow');
            const arrKey = tArr.map(a => a.join(',')).join('|');
            const curArrKey = Array.from(curArrows).map(a => [a.getAttribute('x1'),a.getAttribute('y1'),a.getAttribute('x2'),a.getAttribute('y2')].join(',')).join('|');
            if (arrKey !== curArrKey) {
              curArrows.forEach(a => a.remove());
              svg.querySelectorAll('.tb-arrowhead').forEach(p => p.remove());
              tArr.forEach(a => {
                const ac = a[4] || '#ffffff';
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('class', 'tb-arrow');
                line.setAttribute('x1', a[0] + '%'); line.setAttribute('y1', a[1] + '%');
                line.setAttribute('x2', a[2] + '%'); line.setAttribute('y2', a[3] + '%');
                line.dataset.color = ac;
                line.style.cssText = 'pointer-events:none;stroke:' + ac + ';vector-effect:non-scaling-stroke;';
                if (a[5]) line.setAttribute('stroke-dasharray', '6 4');
                svg.appendChild(line);
              });
              refreshArrowheads(svg);
            }
            // Rects — snap to target frame at t=0
            const tR = to.rects || [];
            const curRects = svg.querySelectorAll('.tb-rect');
            const recKey = tR.map(r => r.join(',')).join('|');
            const curRecKey = Array.from(curRects).map(r => [r.getAttribute('x'),r.getAttribute('y'),r.getAttribute('width'),r.getAttribute('height')].join(',')).join('|');
            if (recKey !== curRecKey) {
              curRects.forEach(r => r.remove());
              tR.forEach(r => {
                const col = r[4] || '#ffffff';
                const op = r[5] != null ? r[5] : 0.3;
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('class', 'tb-rect');
                rect.setAttribute('x', r[0] + '%'); rect.setAttribute('y', r[1] + '%');
                rect.setAttribute('width', r[2] + '%'); rect.setAttribute('height', r[3] + '%');
                rect.setAttribute('fill', col); rect.setAttribute('fill-opacity', op);
                rect.setAttribute('stroke', col);
                rect.style.cssText = 'pointer-events:none;vector-effect:non-scaling-stroke;';
                svg.appendChild(rect);
              });
            }
          }
          // Text labels — snap content to target at t=0, interpolate position
          const tT = to.texts || [];
          const fT = from.texts || [];
          const maxT = Math.max(fT.length, tT.length);
          let textEls = Array.from(innerEl.querySelectorAll('.tb-text-label'));
          for (let i = textEls.length - 1; i >= tT.length; i--) textEls[i].remove();
          for (let i = 0; i < tT.length; i++) {
            const ft = fT[i] || tT[i], tt = tT[i];
            let lbl = innerEl.querySelectorAll('.tb-text-label')[i];
            if (!lbl) {
              lbl = document.createElement('div');
              lbl.className = 'tb-text-label';
              lbl.style.pointerEvents = 'none';
              innerEl.appendChild(lbl);
            }
            lbl.style.left = lerp(ft[0], tt[0], t) + '%';
            lbl.style.top = lerp(ft[1], tt[1], t) + '%';
            lbl.textContent = tt[2];
            const ic = tt[3]||'#000000';
            const ia = tt[4]!=null?tt[4]:0.8;
            lbl.style.background = hexToRgba(ic, ia);
            lbl.style.color = textColorFor(ic);
          }
          // Pen lines — snap to target frame at t=0
          if (svg) {
            const tPen = to.penLines || [];
            const curPen = svg.querySelectorAll('.tb-pen-line');
            const penKey = tPen.map(p => p[0]).join('|');
            const curKey = Array.from(curPen).map(p => p.getAttribute('points')).join('|');
            if (penKey !== curKey) {
              curPen.forEach(p => p.remove());
              tPen.forEach(p => {
                const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                pl.setAttribute('class', 'tb-pen-line');
                pl.setAttribute('points', p[0]);
                pl.style.cssText = 'pointer-events:none;fill:none;stroke:' + (p[1]||'#ffffff') + ';vector-effect:non-scaling-stroke;';
                if (p[2]) pl.setAttribute('stroke-dasharray', '6 4');
                svg.appendChild(pl);
              });
            }
          }
          // Cones — snap to target frame at t=0
          const tCones = to.cones || [];
          const curCones = innerEl.querySelectorAll('.tb-cone');
          const coneKey = tCones.map(c => c[0] + ',' + c[1]).join('|');
          const curConeKey = Array.from(curCones).map(c => parseFloat(c.style.left) + ',' + parseFloat(c.style.top)).join('|');
          if (coneKey !== curConeKey) {
            curCones.forEach(c => c.remove());
            tCones.forEach(c => {
              const div = document.createElement('div');
              div.className = 'tb-cone';
              div.style.cssText = 'left:' + c[0] + '%;top:' + c[1] + '%;pointer-events:none;';
              innerEl.appendChild(div);
            });
          }
          // Re-scale newly created elements
          scaleRoField(innerEl, innerEl.offsetWidth);
        }

        // Apply frame 0
        applyRoFrame(frames[0]);
        let fIdx = 0;
        function playNext() {
          if (!fieldEl._roPlaying || fIdx >= frames.length - 1) {
            applyRoFrame(frames[0]);
            fieldEl._roPlaying = false;
            btn.classList.remove('playing');
            return;
          }
          const from = frames[fIdx];
          const to = frames[fIdx + 1];
          const dur = to.duration || 1000;
          const startT = performance.now();
          function animate(now) {
            if (!fieldEl._roPlaying) { applyRoFrame(frames[0]); btn.classList.remove('playing'); return; }
            const t = Math.min((now - startT) / dur, 1);
            interpolateRo(from, to, t);
            if (t < 1) {
              requestAnimationFrame(animate);
            } else {
              fIdx++;
              if (fIdx < frames.length - 1) {
                applyRoFrame(frames[fIdx]);
                setTimeout(playNext, 0);
              } else {
                setTimeout(() => {
                  applyRoFrame(frames[0]);
                  fieldEl._roPlaying = false;
                  btn.classList.remove('playing');
                }, 1000);
              }
            }
          }
          requestAnimationFrame(animate);
        }
        setTimeout(playNext, 200);
      });
    });
    // Proportional scaling for RO boards (defer to ensure layout is computed)
    requestAnimationFrame(() => requestAnimationFrame(() => scaleRoBoards()));
  }

  /* Scale circles, ball, cones, text-labels, nums, play-btn, pitch markings
     proportionally based on the actual rendered field width.
     Reference sizes are the editor board at 600px (max-width of RO boards). */
  function scaleRoBoards() {
    document.querySelectorAll('.tb-field-readonly').forEach(field => {
      const inner = field.querySelector('.tb-field-inner');
      if (!inner) return;
      const w = inner.offsetWidth;
      if (!w) return;
      scaleRoField(inner, w);
      // Observe future resizes
      if (!inner._roResObs) {
        inner._roResObs = new ResizeObserver(entries => {
          for (const e of entries) {
            const nw = e.contentRect.width;
            if (nw > 0) scaleRoField(e.target, nw);
          }
        });
        inner._roResObs.observe(inner);
      }
    });
  }
  function scaleRoField(inner, w) {
    // Reference: editor board is 820px wide (814px inner after 3px border) with 24px circles, 16px ball, etc.
    // Scale so RO boards are a proportional miniature of the editor.
    const REF = 814; // editor inner width (820 - 2*3px border)
    const s = w / REF; // scale factor
    const circle = Math.max(10, 24 * s);
    const ballSz = Math.max(8, 16 * s);
    const bdr = Math.max(1, 2 * s);
    const fs = Math.max(6, 13 * s);
    const coneSide = Math.max(3, 7 * s);
    const coneBot = Math.max(6, 14 * s);
    const txtFs = Math.max(5, 14 * s);
    const playS = Math.max(16, 30 * s);
    const playTriTB = Math.max(3, 6 * s);
    const playTriL = Math.max(5, 10 * s);
    const playTriML = Math.max(1, 2 * s);
    const pitchBdr = Math.max(1, 3 * s);
    const spotSz = Math.max(3, 6 * s);
    const ballFs = Math.max(6, 14 * s);

    inner.querySelectorAll('.tb-circle').forEach(c => {
      c.style.width = circle + 'px';
      c.style.height = circle + 'px';
      c.style.borderWidth = bdr + 'px';
    });
    inner.querySelectorAll('.tb-num').forEach(n => {
      n.style.fontSize = fs + 'px';
    });
    inner.querySelectorAll('.tb-ball').forEach(b => {
      b.style.width = ballSz + 'px';
      b.style.height = ballSz + 'px';
      b.style.setProperty('--ball-fs', ballFs + 'px');
    });
    inner.querySelectorAll('.tb-cone').forEach(cone => {
      cone.style.borderLeftWidth = coneSide + 'px';
      cone.style.borderRightWidth = coneSide + 'px';
      cone.style.borderBottomWidth = coneBot + 'px';
    });
    inner.querySelectorAll('.tb-text-label').forEach(t => {
      t.style.fontSize = txtFs + 'px';
    });
    const play = inner.querySelector('.tb-ro-play');
    if (play) {
      play.style.width = playS + 'px';
      play.style.height = playS + 'px';
      play.style.setProperty('--play-tri-tb', playTriTB + 'px');
      play.style.setProperty('--play-tri-l', playTriL + 'px');
      play.style.setProperty('--play-tri-ml', playTriML + 'px');
    }
    // Pitch markings — set individual sides to preserve 'none' sides from CSS
    const pw = pitchBdr + 'px';
    inner.querySelectorAll('.tb-halfway').forEach(e => { e.style.borderLeftWidth = pw; });
    inner.querySelectorAll('.tb-center-circle').forEach(e => { e.style.borderWidth = pw; });
    inner.querySelectorAll('.tb-penalty-left').forEach(e => { e.style.borderTopWidth = pw; e.style.borderRightWidth = pw; e.style.borderBottomWidth = pw; });
    inner.querySelectorAll('.tb-penalty-right').forEach(e => { e.style.borderTopWidth = pw; e.style.borderLeftWidth = pw; e.style.borderBottomWidth = pw; });
    inner.querySelectorAll('.tb-goal-left').forEach(e => { e.style.borderTopWidth = pw; e.style.borderRightWidth = pw; e.style.borderBottomWidth = pw; });
    inner.querySelectorAll('.tb-goal-right').forEach(e => { e.style.borderTopWidth = pw; e.style.borderLeftWidth = pw; e.style.borderBottomWidth = pw; });
    inner.querySelectorAll('.tb-penalty-arc-left, .tb-penalty-arc-right').forEach(e => { e.style.borderWidth = pw; });
    inner.querySelectorAll('.tb-center-spot, .tb-penalty-spot-left, .tb-penalty-spot-right').forEach(s => {
      s.style.width = spotSz + 'px'; s.style.height = spotSz + 'px';
    });
    // SVG stroke scaling — use non-scaling-stroke with pixel values scaled to board
    const svgStroke = Math.max(1.5, 2.5 * s);
    const svgStrokeThin = Math.max(1, 1.5 * s);
    inner.querySelectorAll('.tb-arrow').forEach(a => { a.style.strokeWidth = svgStroke + 'px'; a.style.vectorEffect = 'non-scaling-stroke'; });
    inner.querySelectorAll('.tb-rect').forEach(r => { r.style.strokeWidth = svgStrokeThin + 'px'; r.style.vectorEffect = 'non-scaling-stroke'; });
    inner.querySelectorAll('.tb-pen-line').forEach(p => { p.style.setProperty('stroke-width', svgStroke + 'px', 'important'); p.style.setProperty('vector-effect', 'non-scaling-stroke', 'important'); });
    // Recompute arrowheads with correct board dimensions
    const svg = inner.querySelector('.tb-arrows-svg');
    if (svg) refreshArrowheads(svg);
  }

  function renderMatchDetail() {
    const matches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
    const m = matches.find(x => x.id === detailMatchId);
    if (!m) return '<div class="empty-state"><div class="empty-icon">⚽</div><p>Match not found</p></div>';
    const session = getSession();
    const sentData = JSON.parse(localStorage.getItem('fa_convocatoria_sent') || '{}');
    const sentEntry = sentData[m.id];
    const sentPlayers = sentEntry ? (Array.isArray(sentEntry) ? sentEntry : (sentEntry.players || [])) : [];
    const convSent = sentPlayers.length > 0;
    const convIncluded = convSent && sentPlayers.some(id => String(id) === String(session.id));
    const sentJersey = sentEntry && !Array.isArray(sentEntry) ? sentEntry.jersey : null;
    const sentSocks = sentEntry && !Array.isArray(sentEntry) ? sentEntry.socks : null;
    let convHtml = '';
    if (convSent) {
      const uniformIcons = (sentJersey || sentSocks) ? `<span class="detail-uniform-inline">${jerseySvg(sentJersey || 'white')}${sockSvg(sentSocks || 'striped')}</span>` : '';
      convHtml = convIncluded
        ? `<div class="detail-conv detail-conv-yes"><span class="conv-blink-dot"></span> ${t('match_detail.conv_available')} ${uniformIcons}</div>`
        : `<div class="detail-conv detail-conv-no"><span class="conv-grey-dot"></span> ${t('match_detail.conv_not_called')}</div>`;
    }
    const dateFormatted = m.date ? tDateLong(m.date) : '—';
    const locationHtml = m.mapLink
      ? `<a href="${sanitize(m.mapLink)}" target="_blank" rel="noopener" class="detail-map-link">📍 ${sanitize(m.location || '—')}</a>`
      : `📍 ${sanitize(m.location || '—')}`;

    // Build called-up player list
    const isStaff = detailMatchFrom === 'staff-matchday' && (session.roles || []).includes('staff');
    const isPast = m.date && m.time && new Date(m.date + 'T' + m.time + ':00') <= new Date();
    let calledHtml = '';
    if (convSent) {
      const users = getUsers();
      const calledPlayers = sentPlayers.map(id => users.find(u => String(u.id) === String(id))).filter(Boolean)
        .sort((a, b) => posRankGlobal(a) - posRankGlobal(b));
      if (calledPlayers.length) {
        const startingXI = getStartingXI(m.id);
        const starterCount = startingXI.length;
        const showStarterInfo = isStaff || isPast; // staff always, players only after kickoff
        const rows = calledPlayers.map(p => {
          const pid = String(p.id);
          const isStarter = startingXI.some(function(id) { return String(id) === pid; });
          const starterCls = (showStarterInfo && isStarter) ? ' detail-player-starter' : '';
          const toggleBtn = isStaff
            ? `<button class="starter-toggle${isStarter ? ' starter-active' : ''}" data-player-id="${pid}" data-match-id="${m.id}" title="${isStarter ? 'Treure de titulars' : 'Afegir a titulars'}"></button>`
            : (showStarterInfo && isStarter ? '<span class="starter-badge">★</span>' : '');
          return `<div class="detail-player${starterCls}">${toggleBtn}<span class="conv-pos-circles">${posCirclesHtmlGlobal(p)}</span><span class="detail-player-name">${sanitize(p.name)}</span><span class="detail-player-num">#${sanitize(p.playerNumber || '—')}</span></div>`;
        }).join('');
        let starterHeader = '';
        if (isStaff) {
          const warnCls = starterCount === 11 ? 'starter-count-ok' : (starterCount > 11 ? 'starter-count-over' : 'starter-count-under');
          const warnIcon = starterCount !== 11 ? ' <span class="starter-emoji">⚠️</span>' : ' <span class="starter-emoji">✅</span>';
          starterHeader = `<div class="starter-counter ${warnCls}">Titulars: <strong>${starterCount}/11</strong>${warnIcon}</div>`;
        }
        calledHtml = `<div class="detail-callup-panel"><div class="detail-callup-header">Called Up <span class="conv-count">${calledPlayers.length}</span></div>${starterHeader}${rows}</div>`;
      }
    }

    const convCallupData = JSON.parse(localStorage.getItem('fa_convocatoria_callup') || '{}');
    const callupTime = convCallupData[m.id] || m.callupTime || '—';

    const backPage = detailMatchFrom || backTarget('player-matchday');

    // Past match: events system (replaces old Resultat + Gols)
    let eventsHtml = '';
    if (isPast) {
      const events = getMatchEvents(m.id);
      const users = getUsers();
      const sc = calcMatchScore(events);
      const ourSide = isOurTeam(m.home) ? 'home' : 'away';
      const oppSide = ourSide === 'home' ? 'away' : 'home';

      // ── Scoreboard ──
      const scoreboardHtml = '<div class="ev-scoreboard"><span class="ev-sb-team">' + sanitize(m.home) +
        '</span><span class="ev-sb-score">' + sc.home + ' - ' + sc.away +
        '</span><span class="ev-sb-team">' + sanitize(m.away) + '</span></div>';

      // ── + Event buttons (staff only) ──
      let addEventHtml = '';
      if (isStaff) {
        const calledIds = convSent ? sentPlayers : [];
        const calledUsers = calledIds.map(function(id) { return users.find(function(u) { return String(u.id) === String(id); }); }).filter(Boolean)
          .sort(function(a, b) { return posRankGlobal(a) - posRankGlobal(b); });
        const playerOptsData = calledUsers.map(function(p) {
          return { value: String(p.id), label: sanitize(p.name) + ' #' + sanitize(p.playerNumber || '—') };
        });

        addEventHtml = '<div class="ev-add-row">' +
          '<div class="ev-add-col">' +
            '<button class="btn btn-primary btn-small ev-add-btn" data-ev-side="home">+ Event</button>' +
            '<div class="ev-form" id="ev-form-home" hidden>' +
              (ourSide === 'home' ? buildOurEventForm('home', playerOptsData) : buildOppEventForm('home')) +
            '</div>' +
          '</div>' +
          '<div class="ev-add-col">' +
            '<button class="btn btn-primary btn-small ev-add-btn" data-ev-side="away">+ Event</button>' +
            '<div class="ev-form" id="ev-form-away" hidden>' +
              (ourSide === 'away' ? buildOurEventForm('away', playerOptsData) : buildOppEventForm('away')) +
            '</div>' +
          '</div>' +
        '</div>';
      }

      // ── Event timeline ──
      const sorted = events.slice().sort(function(a, b) { return parseEventMinute(b.minute) - parseEventMinute(a.minute); });
      let timelineHtml = '';
      if (sorted.length) {
        // Track yellow counts per player to detect 2nd yellow
        const yellowCounts = {};
        // First pass: count all yellows per player
        events.forEach(function(e) {
          if (e.type !== 'yellow') return;
          var key = e.side + '_' + (e.playerId || e.playerNumber);
          yellowCounts[key] = (yellowCounts[key] || 0) + 1;
        });
        // Second pass: track running count for rendering
        const yellowSeen = {};

        timelineHtml = '<div class="ev-timeline">' + sorted.map(function(ev) {
          var key = ev.side + '_' + (ev.playerId || ev.playerNumber);
          var ycForIcon = 0;
          if (ev.type === 'yellow') {
            yellowSeen[key] = (yellowSeen[key] || 0) + 1;
            // Reverse order since sorted desc — 2nd yellow is the one with higher minute
            // Actually we need ordinal among this player's yellows. Use total count.
            ycForIcon = yellowCounts[key] >= 2 && yellowSeen[key] === yellowCounts[key] ? 2 : 1;
          }

          var icon = getEventIcon(ev, ycForIcon);
          var name = getEventPlayerName(ev, users);
          var min = formatEventMinute(ev.minute);

          // Build detail line
          var detail = '';
          if (ev.type === 'goal') {
            if (ev.goalDetail === 'assistencia' && ev.assistPlayerId) {
              var assistName = resolveEventName(ev.assistPlayerId, ev.assistPlayerName, null, users);
              // Format like a substitution: scorer bold + assister grey
              if (ev.side === 'home') {
                name = '<span class="ev-scorer-name">' + name + '</span><span class="ev-assist-name">' + assistName + '</span>';
              } else {
                name = '<span class="ev-assist-name">' + assistName + '</span><span class="ev-scorer-name">' + name + '</span>';
              }
              detail = ''; // name already includes assist
            }
          }
          if (ev.type === 'change') {
            var outName = resolveEventName(ev.playerOutId, ev.playerOutName, ev.playerOutNumber, users);
            var inName = resolveEventName(ev.playerInId, ev.playerInName, ev.playerInNumber, users);
            // Home: IN (bold) then OUT (grey) | Away: OUT (grey) then IN (bold)
            if (ev.side === 'home') {
              name = '<span class="ev-sub-in">' + inName + '</span><span class="ev-sub-out">' + outName + '</span>';
            } else {
              name = '<span class="ev-sub-out">' + outName + '</span><span class="ev-sub-in">' + inName + '</span>';
            }
          }

          var deleteBtn = isStaff ? '<button class="ev-delete" data-ev-id="' + ev.id + '" title="Eliminar">✕</button>' : '';

          if (ev.side === 'home') {
            return '<div class="ev-row ev-row-home">' +
              (isStaff ? '<div class="ev-cell ev-cell-del">' + deleteBtn + '</div>' : '') +
              '<div class="ev-cell ev-cell-min">' + min + '</div>' +
              '<div class="ev-cell ev-cell-icon">' + icon + '</div>' +
              '<div class="ev-cell ev-cell-home"><span class="ev-name">' + name + '</span>' + detail + '</div>' +
              '<div class="ev-cell ev-cell-away"></div>' +
            '</div>';
          } else {
            return '<div class="ev-row ev-row-away">' +
              '<div class="ev-cell ev-cell-home"></div>' +
              '<div class="ev-cell ev-cell-away"><span class="ev-name">' + name + '</span>' + detail + '</div>' +
              '<div class="ev-cell ev-cell-icon">' + icon + '</div>' +
              '<div class="ev-cell ev-cell-min">' + min + '</div>' +
              (isStaff ? '<div class="ev-cell ev-cell-del">' + deleteBtn + '</div>' : '') +
            '</div>';
          }
        }).join('') + '</div>';
      } else if (!isStaff) {
        // Fallback: old fa_match_goals for player view on old matches
        var oldGoals = JSON.parse(localStorage.getItem('fa_match_goals') || '{}');
        var mg = oldGoals[m.id] || [];
        if (mg.length) {
          timelineHtml = '<div class="ev-timeline">' + mg.map(function(g) {
            var pName = g.playerId === 'og' ? 'Gol en pròpia' : (function() { var p = users.find(function(u) { return String(u.id) === String(g.playerId); }); return p ? sanitize(p.name) : 'Desconegut'; })();
            return '<div class="ev-row"><div class="ev-cell ev-cell-home"><span class="ev-name">' + pName + '</span></div><div class="ev-cell ev-cell-icon"><span class="ev-icon ev-icon-goal">⚽</span></div><div class="ev-cell ev-cell-min">' + (g.minute ? g.minute + "'" : '') + '</div><div class="ev-cell ev-cell-away"></div></div>';
          }).join('') + '</div>';
        }
      }

      eventsHtml = '<div class="card ev-card"><div class="card-title">' + t('match_detail.events') + '</div>' +
        scoreboardHtml + addEventHtml + timelineHtml + '</div>';
    }

    // Generic custom dropdown builder (text-only options)
    function buildCustomSelect(cls, side, placeholder, optsArr) {
      var optHtml = optsArr.map(function(o) {
        return '<div class="ev-cs-option" data-value="' + o.value + '">' + o.label + '</div>';
      }).join('');
      return '<div class="ev-custom-select" data-ev-side="' + side + '">' +
        '<div class="ev-cs-trigger"><span class="ev-cs-label">' + placeholder + '</span><span class="ev-cs-arrow"></span></div>' +
        '<div class="ev-cs-options">' + optHtml + '</div>' +
        '<input type="hidden" class="ev-cs-value ' + cls + '" data-ev-side="' + side + '" data-placeholder="' + placeholder + '" value="">' +
      '</div>';
    }

    function buildEvTypeDropdown(side) {
      var opts = [
        { value: 'goal', label: t('ev.goal'), icon: 'img/gol.png' },
        { value: 'own_goal', label: t('ev.own_goal'), icon: 'img/gol-propia.png' },
        { value: 'yellow', label: t('ev.yellow'), icon: 'img/groga.png' },
        { value: 'red', label: t('ev.red'), icon: 'img/vermella.png' },
        { value: 'change', label: t('ev.change'), icon: 'img/sub-' + side + '.jpg' },
        { value: 'penal_fallat', label: t('ev.penal_miss'), icon: 'img/penal%20fallat.png' },
        { value: 'pal', label: t('ev.post'), icon: 'img/pal.png' }
      ];
      var optHtml = opts.map(function(o) {
        return '<div class="ev-cs-option" data-value="' + o.value + '"><img src="' + o.icon + '" class="ev-cs-icon" alt="">' + o.label + '</div>';
      }).join('');
      return '<div class="ev-custom-select" data-ev-side="' + side + '">' +
        '<div class="ev-cs-trigger"><span class="ev-cs-label">' + t('ev.type_ph') + '</span><span class="ev-cs-arrow"></span></div>' +
        '<div class="ev-cs-options">' + optHtml + '</div>' +
        '<input type="hidden" class="ev-cs-value ev-type-select" data-ev-side="' + side + '" data-placeholder="' + t('ev.type_ph') + '" value="">' +
      '</div>';
    }

    function buildOurEventForm(side, playerData) {
      var goalTypeOpts = [
        { value: 'penal', label: t('ev.goal_penal') },
        { value: 'falta_directa', label: t('ev.goal_falta') },
        { value: 'jugada_oberta', label: t('ev.goal_jugada') }
      ];
      var goalDetailOpts = [
        { value: 'assistencia', label: t('ev.assist') },
        { value: 'individual', label: t('ev.individual') }
      ];
      return '<div class="ev-form-inner">' +
        buildEvTypeDropdown(side) +
        buildCustomSelect('ev-player-select', side, t('ev.player_ph'), playerData) +
        '<div class="ev-goal-fields" data-ev-side="' + side + '" hidden>' +
          buildCustomSelect('ev-goal-type', side, t('ev.goal_type_ph'), goalTypeOpts) +
          '<div class="ev-jugada-fields" data-ev-side="' + side + '" hidden>' +
            buildCustomSelect('ev-goal-detail', side, t('ev.detail_ph'), goalDetailOpts) +
            buildCustomSelect('ev-assist-select', side, t('ev.assist_ph'), playerData) +
          '</div>' +
        '</div>' +
        '<div class="ev-change-fields" data-ev-side="' + side + '" hidden>' +
          buildCustomSelect('ev-player-out', side, t('ev.sub_out_ph'), playerData) +
          buildCustomSelect('ev-player-in', side, t('ev.sub_in_ph'), playerData) +
        '</div>' +
        '<div class="ev-confirm-row" data-ev-side="' + side + '" hidden>' +
          '<input type="text" class="reg-input ev-minute" data-ev-side="' + side + '" placeholder="' + t('ev.minute_ph') + '" maxlength="5" style="width:65px;text-align:center;">' +
          '<button class="btn btn-primary btn-small ev-submit" data-ev-side="' + side + '">' + t('ev.add') + '</button>' +
        '</div>' +
      '</div>';
    }

    function buildOppEventForm(side) {
      return '<div class="ev-form-inner">' +
        buildEvTypeDropdown(side) +
        '<input type="text" class="reg-input ev-opp-number" data-ev-side="' + side + '" placeholder="#" maxlength="3" style="width:50px;text-align:center;">' +
        '<div class="ev-change-fields" data-ev-side="' + side + '" hidden>' +
          '<input type="text" class="reg-input ev-opp-out" data-ev-side="' + side + '" placeholder="' + t('ev.opp_out') + '" maxlength="3" style="width:55px;text-align:center;">' +
          '<input type="text" class="reg-input ev-opp-in" data-ev-side="' + side + '" placeholder="' + t('ev.opp_in') + '" maxlength="3" style="width:55px;text-align:center;">' +
        '</div>' +
        '<div class="ev-confirm-row" data-ev-side="' + side + '" hidden>' +
          '<input type="text" class="reg-input ev-minute" data-ev-side="' + side + '" placeholder="' + t('ev.minute_ph') + '" maxlength="5" style="width:65px;text-align:center;">' +
          '<button class="btn btn-primary btn-small ev-submit" data-ev-side="' + side + '">Afegir</button>' +
        '</div>' +
      '</div>';
    }

    return `
      <button class="btn btn-outline btn-small detail-back" data-back="${backPage}">${t('btn.back')}</button>
      <div class="detail-hero detail-hero-match">
        <div class="detail-hero-badge"><span class="badge badge-yellow" style="font-size:.9rem;padding:.3rem .8rem;">${t('match_detail.badge')}</span></div>
        <h2 class="detail-title">${matchLabel(m)}</h2>
        <div class="detail-subtitle">${dateFormatted}</div>
        <div class="detail-meta">
          ${convSent ? `<span>🕐 ${t('match_detail.callup')} ${callupTime}</span>` : ''}
          <span><img src="img/whistle.png" class="kickoff-icon" alt=""> ${t('match_detail.kickoff')} ${m.time || '—'}</span>
          <span>${locationHtml}</span>
        </div>
        ${convHtml}
      </div>
      ${eventsHtml}
      ${(() => {
        if (!convSent) return calledHtml;
        const matchBoards = JSON.parse(localStorage.getItem('fa_tactic_match_boards') || '{}');
        const boards = matchBoards[m.id] || [];
        // Group boards by tag
        const tagOrder = ['Presión', 'Salida', 'Estrategia'];
        const grouped = {};
        boards.forEach(b => {
          const t = b.tag || '';
          if (!grouped[t]) grouped[t] = [];
          grouped[t].push(b);
        });
        // Build ordered tag keys: specified order first, then remaining
        const orderedTags = [];
        tagOrder.forEach(t => { if (grouped[t]) orderedTags.push(t); });
        Object.keys(grouped).forEach(t => { if (!orderedTags.includes(t)) orderedTags.push(t); });

        // Video links + per-video comments section
        const sentVids = sentEntry && sentEntry.videos ? sentEntry.videos : [];
        let videosGroupHtml = '';
        if (sentVids.length) {
          const vidItems = sentVids.map(v => {
            const commentHtml = v.comment ? '<div class="detail-comments">' + sanitize(v.comment).replace(/\n/g, '<br>') + '</div>' : '';
            return '<div class="detail-video-item"><a href="#" class="detail-video-link" data-video-url="' + sanitize(v.url) + '">' + sanitize(v.title || 'Video') + '</a>' + commentHtml + '</div>';
          }).join('');
          videosGroupHtml = '<div class="detail-board-group"><div class="detail-board-group-title">🎬 Videos</div>' + vidItems + '</div>';
        }

        let boardsHtml = '';
        if (boards.length || sentVids.length) {
          boardsHtml = '<div class="detail-boards-panel">' + videosGroupHtml +
            orderedTags.map(tag => {
              const tagTitle = tag || 'General';
              return '<div class="detail-board-group"><div class="detail-board-group-title">' + sanitize(tagTitle) + '</div>' +
                grouped[tag].map(b => renderReadOnlyBoard(b, 'ro1-')).join('') + '</div>';
            }).join('') + '</div>';
        }

        if (!calledHtml && !boardsHtml) return '';
        return '<div class="detail-match-layout">' + calledHtml + boardsHtml + '</div>';
      })()}`;
  }

  function renderTrainingDetail() {
    const training = getTrainings();
    const tr = training.find(x => String(x.id) === String(detailTrainingId));
    if (!tr) return '<div class="empty-state"><div class="empty-icon">🏋️</div><p>Training not found</p></div>';
    const dateFormatted = tr.date ? tDateLong(tr.date) : '—';
    const assistHtml = tr.assistance != null ? buildAssistanceCircle(tr.assistance) : '';
    return `
      <button class="btn btn-outline btn-small detail-back" data-back="${backTarget('player-home')}">${t('btn.back')}</button>
      <div class="detail-hero detail-hero-training">
        <div class="detail-hero-badge"><span class="badge badge-green" style="font-size:.9rem;padding:.3rem .8rem;">${t('training.badge')}</span></div>
        <h2 class="detail-title">${sanitize(tr.focus)}</h2>
        <div class="detail-subtitle">${dateFormatted}</div>
      </div>
      <div class="detail-grid">
        <div class="detail-card"><div class="detail-card-label">Time</div><div class="detail-card-value">${sanitize(tr.time || '—')}</div></div>
        <div class="detail-card"><div class="detail-card-label">${t('training.th_day')}</div><div class="detail-card-value">${tr.date ? tDay(new Date(tr.date + 'T12:00:00').getDay()) : sanitize(tr.day || '—')}</div></div>
        <div class="detail-card"><div class="detail-card-label">${t('training.th_location')}</div><div class="detail-card-value">${sanitize(tr.location || '—')}</div></div>
        <div class="detail-card"><div class="detail-card-label">Attendance</div><div class="detail-card-value">${assistHtml || '—'}</div></div>
      </div>
      ${(() => {
        const trainingBoards = JSON.parse(localStorage.getItem('fa_tactic_training_boards') || '{}');
        const boards = trainingBoards[tr.date] || [];
        if (!boards.length) return '';
        const tagOrder = ['Presión', 'Salida', 'Estrategia'];
        const grouped = {};
        boards.forEach(b => { const tg = b.tag || ''; if (!grouped[tg]) grouped[tg] = []; grouped[tg].push(b); });
        const orderedTags = [];
        tagOrder.forEach(tg => { if (grouped[tg]) orderedTags.push(tg); });
        Object.keys(grouped).forEach(tg => { if (!orderedTags.includes(tg)) orderedTags.push(tg); });
        return '<div class="card"><div class="card-title">Tactical Boards</div><div class="detail-boards-panel">' +
          orderedTags.map(tag => {
            const tagTitle = tag || 'General';
            return '<div class="detail-board-group"><div class="detail-board-group-title">' + sanitize(tagTitle) + '</div>' +
              grouped[tag].map(b => {
                const boardHtml = renderReadOnlyBoard(b, 'ro-ptd-');
                let teamsBlock = '';
                if (b.linkedTeams && b.linkedTeams.length) {
                  teamsBlock = '<div class="tb-linked-teams">' +
                    b.linkedTeams.map((tm, ti) => {
                      const rows = tm.players.map(p => {
                        const posArr = (p.position || '').split(',').map(s => s.trim()).filter(Boolean);
                        const posHtml = posArr.length ? posArr.map(pos => '<span class="pos-circle pos-' + pos + '">' + pos + '</span>').join('') : '';
                        const teamC = p.team ? '<span class="conv-team-circle">' + sanitize(p.team) + '</span>' : '';
                        return '<div class="tb-lt-player">' + posHtml + ' <span>' + sanitize(p.name) + '</span>' + teamC + '</div>';
                      }).join('');
                      return '<div class="tb-lt-team"><div class="tb-lt-team-title">Equip ' + (ti + 1) + ' <span class="tg-team-count">' + tm.players.length + '</span></div>' + rows + '</div>';
                    }).join('') + '</div>';
                }
                return boardHtml + teamsBlock;
              }).join('') + '</div>';
          }).join('') + '</div></div>';
      })()}`;
  }

  // getSeasonWeek → utils.js

  // #endregion Tactical Board Rendering

  // #region Readiness Engine & Charts
  // ===== Readiness Score Engine =====
  let _readinessDataCache = null, _readinessDataFrame = -1;
  function getReadinessData() {
    const f = window._renderFrame || 0;
    if (_readinessDataCache && _readinessDataFrame === f) return _readinessDataCache;
    _readinessDataCache = {
      rpeData: JSON.parse(localStorage.getItem('fa_player_rpe') || '{}'),
      trainingList: getTrainings(),
      matchesList: JSON.parse(localStorage.getItem('fa_matches') || '[]'),
      availData: JSON.parse(localStorage.getItem('fa_training_availability') || '{}'),
      staffOverrides: JSON.parse(localStorage.getItem('fa_training_staff_override') || '{}'),
      matchAvailData: JSON.parse(localStorage.getItem('fa_match_availability') || '{}')
    };
    _readinessDataCache.squad = buildSquadLoadIndex(_readinessDataCache.rpeData);
    _readinessDataFrame = f;
    return _readinessDataCache;
  }

  /**
   * What the squad reported for each session, so a player who trained but
   * never submitted can borrow their team-mates' answer.
   *
   * Counting a missing RPE as ZERO load is the third readiness defect: it
   * drags the chronic mean down, which inflates the next ACWR and flags the
   * player. That is a reporting gap being read as physiological risk — and
   * it compounds on a squad that reports patchily.
   *
   * One pass over fa_player_rpe, built with the rest of the readiness data.
   *   trainings → { date: {rpe, minutes} }   the mean of everyone who reported
   *   matches   → { matchId: [{rpe, minutes}] }  kept per player, because
   *              match RPE tracks minutes played and a squad-wide mean would
   *              be meaningless — the band is picked at the call site.
   */
  function buildSquadLoadIndex(rpeData) {
    const tr = {};
    const mt = {};
    Object.keys(rpeData || {}).forEach((key) => {
      const e = rpeData[key];
      if (!e || e.rpe == null || e.minutes == null) return;
      const t = key.indexOf('_training_');
      if (t !== -1) {
        /* Bucketed under the session id AND the date. The date bucket is
           what a legacy record can offer; the session bucket is exact, and
           is what the consumer prefers. `e.date` is read from the record
           rather than sliced out of the key, because the key's suffix is a
           session id now, not a date. */
        const add = (b) => {
          if (!b) return;
          if (!tr[b]) tr[b] = { rpe: 0, minutes: 0, n: 0 };
          tr[b].rpe += e.rpe; tr[b].minutes += e.minutes; tr[b].n++;
        };
        add(e.sessionId || key.slice(t + 10));
        if (e.date && e.date !== e.sessionId) add(e.date);
        return;
      }
      const m = key.indexOf('_match_');
      if (m !== -1) {
        const id = key.slice(m + 7);
        if (!mt[id]) mt[id] = [];
        mt[id].push({ rpe: e.rpe, minutes: e.minutes });
      }
    });
    Object.keys(tr).forEach((d) => {
      tr[d].rpe = tr[d].rpe / tr[d].n;
      tr[d].minutes = tr[d].minutes / tr[d].n;
    });
    return { training: tr, match: mt };
  }

  /**
   * Estimated RPE for a match the player played but did not report.
   *
   * Banded by minutes, not a squad mean: 20 minutes off the bench and a full
   * 90 are different sessions, and averaging them describes neither. Falls
   * back to every reporter for that match when nobody played a similar
   * amount.
   */
  /**
   * Minutes a player was actually on the pitch for one match.
   *
   * Derived from the starting XI and the substitution events, which is the
   * only place it exists when the player never submitted an RPE. Reuses
   * computePlayerMatchStats rather than re-deriving the interval arithmetic,
   * and memoises per player because the roster already calls it once per row
   * — without the memo this would double that work.
   */
  let _pmMinutesCache = null;
  let _pmMinutesFrame = -1;
  function playerMatchMinutes(uid, matchId) {
    const f = window._renderFrame || 0;
    if (_pmMinutesFrame !== f) { _pmMinutesCache = {}; _pmMinutesFrame = f; }
    if (!_pmMinutesCache[uid]) {
      const byId = {};
      try {
        computePlayerMatchStats(uid).matchRows.forEach((r) => {
          if (typeof r.minutes === 'number') byId[String(r.matchId)] = r.minutes;
        });
      } catch (e) { /* stats unavailable — fall through to 0 */ }
      _pmMinutesCache[uid] = byId;
    }
    return _pmMinutesCache[uid][String(matchId)] || 0;
  }

  function imputeMatchRpe(squad, matchId, minutes) {
    const reported = (squad.match || {})[String(matchId)] || [];
    if (!reported.length) return null;
    const band = reported.filter((r) => Math.abs(r.minutes - minutes) <= 10);
    const use = band.length ? band : reported;
    return use.reduce((sum, r) => sum + r.rpe, 0) / use.length;
  }

  function computeReadiness(playerId) {
    const { rpeData, trainingList, matchesList, availData, staffOverrides, matchAvailData, squad } = getReadinessData();
    const uid = playerId;
    const now = new Date();
    const todayStr = localDateStr(now);
    const seasonStart = seasonStartStr(now);

    // Build sessions
    const sessions = [];
    trainingList.forEach(t => {
      if (!t.date || t.date < seasonStart || t.date > todayStr) return;
      const avail = readRecord(staffOverrides, uid, t, 'avail') ||
        readRecord(availData, uid, t, 'avail') || '';
      const excluded = avail === 'no' || avail === 'injured';
      const entry = excluded ? null : readRecord(rpeData, uid, t, 'rpe');
      if (entry) {
        sessions.push({ date: t.date, type: 'training', rpe: entry.rpe, minutes: entry.minutes, real: true });
      } else if (!excluded && (squad.training[t.id] || squad.training[t.date])) {
        /* Present but never reported: borrow what the squad reported for
           this same session, rather than counting it as no load at all.
           `real: false` keeps it out of hasData — an estimate fills a gap,
           it does not prove the player is being monitored. */
        const est = squad.training[t.id] || squad.training[t.date];
        sessions.push({ date: t.date, type: 'training', rpe: est.rpe, minutes: est.minutes, real: false, estimated: true });
      } else {
        sessions.push({ date: t.date, type: 'training', rpe: null, minutes: null });
      }
    });
    matchesList.forEach(m => {
      if (!m.date || m.date < seasonStart || m.date > todayStr) return;
      const rpeKey = uid + '_match_' + m.id;
      const entry = rpeData[rpeKey];
      if (entry) {
        sessions.push({ date: m.date, type: 'match', rpe: entry.rpe, minutes: entry.minutes, matchId: m.id, real: true });
      } else {
        // Minutes come from the events, not the RPE, so a match can be
        // estimated even when the player submitted nothing at all.
        const mins = playerMatchMinutes(uid, m.id);
        const est = mins > 0 ? imputeMatchRpe(squad, m.id, mins) : null;
        sessions.push(est == null ?
          { date: m.date, type: 'match', rpe: null, minutes: null, matchId: m.id } :
          { date: m.date, type: 'match', rpe: est, minutes: mins, matchId: m.id, real: false, estimated: true });
      }
    });
    Object.keys(rpeData).forEach(key => {
      if (!key.startsWith(uid + '_extra_')) return;
      const entry = rpeData[key];
      if (!entry || !entry.date || entry.date < seasonStart || entry.date > todayStr) return;
      sessions.push({ date: entry.date, type: 'extra', rpe: entry.rpe, minutes: entry.minutes });
    });
    sessions.sort((a, b) => a.date.localeCompare(b.date));

    // --- 1. ACWR (Load Ratio Score) ---
    const weekUA = {};
    sessions.forEach(s => {
      if (s.rpe == null || s.minutes == null) return;
      const wk = getSeasonWeek(s.date);
      if (!weekUA[wk]) weekUA[wk] = 0;
      weekUA[wk] += s.rpe * s.minutes;
    });
    const weekNums = Object.keys(weekUA).map(Number).sort((a, b) => a - b);
    const allWeeks = [];
    if (weekNums.length) { for (let w = weekNums[0]; w <= weekNums[weekNums.length - 1]; w++) allWeeks.push(w); }
    let acwr = 0;
    let prevWeekUA = 0;
    let curWeekUA = 0;
    if (allWeeks.length >= 2) {
      const lastIdx = allWeeks.length - 1;
      const acute = weekUA[allWeeks[lastIdx]] || 0;
      let sum4 = 0, cnt4 = 0;
      for (let j = lastIdx; j >= Math.max(0, lastIdx - 3); j--) {
        sum4 += weekUA[allWeeks[j]] || 0;
        cnt4++;
      }
      const chronic = cnt4 ? sum4 / cnt4 : 0;
      acwr = chronic > 0 ? +(acute / chronic).toFixed(2) : 0;
      curWeekUA = acute;
      prevWeekUA = weekUA[allWeeks[lastIdx - 1]] || 0;
    }

    let loadRatioScore;
    if (acwr < 0.8) loadRatioScore = 60;
    else if (acwr <= 1.3) loadRatioScore = 100;
    else if (acwr <= 1.5) loadRatioScore = 70;
    else loadRatioScore = 30;

    // --- 2. Match Fatigue Score ---
    const matchSessions = sessions.filter(s => s.type === 'match' && s.minutes != null && s.minutes > 0);
    const lastMatch = matchSessions.length ? matchSessions[matchSessions.length - 1] : null;
    /* Fatigue RECOVERS. `lastMatch` is the most recent match anywhere in the
       season, so before this a player who went 90 minutes in March still
       scored 40 in August — permanently 15 points below the 75 green needs,
       for every regular starter. On the demo squad this single rule fired on
       13 of the 19 flagged players.

       The minutes bands stay as the day-zero penalty and fade linearly to no
       penalty by day 5 — the same window the code already uses for its "two
       matches in five days" rule, so no new arbitrary constant appears. */
    const MATCH_RECOVERY_DAYS = 5;
    let matchFatigueScore = 100;
    let matchDaysSince = null;
    if (lastMatch) {
      const mins = lastMatch.minutes;
      let base;
      if (mins > 80) base = 40;
      else if (mins >= 60) base = 60;
      else if (mins >= 30) base = 80;
      else base = 100;

      const matchDate = new Date(lastMatch.date + 'T12:00:00');
      const daysSince = Math.round((now - matchDate) / 86400000);
      matchDaysSince = daysSince;
      const recovered = Math.min(1, Math.max(0, daysSince / MATCH_RECOVERY_DAYS));
      matchFatigueScore = base + (100 - base) * recovered;

      if (daysSince < 3) matchFatigueScore -= 10;

      // 2 matches in last 5 days
      const fiveDaysAgo = localDateStr(new Date(now.getTime() - 5 * 86400000));
      const recentMatches = matchSessions.filter(s => s.date >= fiveDaysAgo);
      if (recentMatches.length >= 2) matchFatigueScore -= 15;

      matchFatigueScore = Math.max(0, Math.min(100, Math.round(matchFatigueScore)));
    }

    // --- 3. Recent Load Spike ---
    let loadSpikeScore = 100;
    if (prevWeekUA > 0) {
      const pctChange = ((curWeekUA - prevWeekUA) / prevWeekUA) * 100;
      if (pctChange > 30) loadSpikeScore = 30;
      else if (pctChange > 10) loadSpikeScore = 60;
      else if (pctChange >= -10) loadSpikeScore = 100;
      else loadSpikeScore = 80;
    }

    // --- 4. RPE Trend (last 28 days) ---
    const d28ago = localDateStr(new Date(now.getTime() - 28 * 86400000));
    const recentRPE = sessions.filter(s => s.date >= d28ago && s.rpe != null);
    let rpeTrendScore = 80;
    if (recentRPE.length >= 4) {
      const half = Math.floor(recentRPE.length / 2);
      const firstHalfAvg = recentRPE.slice(0, half).reduce((s, e) => s + e.rpe, 0) / half;
      const secondHalfAvg = recentRPE.slice(half).reduce((s, e) => s + e.rpe, 0) / (recentRPE.length - half);
      const diff = secondHalfAvg - firstHalfAvg;
      if (diff > 1.5) rpeTrendScore = 40;        // sharp increase
      else if (diff > 0.5) rpeTrendScore = 60;    // mild increase
      else if (diff >= -0.5) rpeTrendScore = 80;   // stable
      else rpeTrendScore = 100;                     // decreasing
    }

    // --- Final weighted score ---
    const score = Math.round(
      0.4 * loadRatioScore +
      0.25 * matchFatigueScore +
      0.2 * loadSpikeScore +
      0.15 * rpeTrendScore
    );

    // --- Color classification ---
    let color = 'green';
    let riskFlags = 0;
    if (acwr > 1.5) riskFlags++;
    if (loadSpikeScore <= 30) riskFlags++;
    if (rpeTrendScore <= 40) riskFlags++;
    if (matchFatigueScore <= 25) riskFlags++;

    /* `acwr >= 0.8` used to sit in this gate, which made green IMPOSSIBLE
       for a player training below their four-week average — whatever their
       score, and up to a score of 84. That conflated two opposite states:
       a high-ACWR player needs protecting today, a low-ACWR one needs
       building up over weeks. The dot now means risk-from-load, and low
       load is surfaced separately (see `underloaded`). It still lowers
       loadRatioScore, so it can still pull someone under 75 — and it stays
       in `reasons` when it does. */
    if (score >= 75 && acwr <= 1.3 && riskFlags === 0) {
      color = 'green';
    } else if (score < 55 || acwr > 1.5 || riskFlags >= 2) {
      color = 'red';
    } else {
      color = 'orange';
    }

    // --- Force overrides ---
    const fourDaysAgo = localDateStr(new Date(now.getTime() - 4 * 86400000));
    const recentHeavyMatches = matchSessions.filter(s => s.date >= fourDaysAgo && s.minutes >= 70);
    /* Two brutal sessions BACK TO BACK, with no recovery between them.
       Sliced from every session in the window, not just the ones carrying an
       RPE: `recentRPE` skips sessions the player sat out, so hard Monday →
       rest Wednesday → hard Friday used to read as consecutive. The rest day
       was invisible to the rule, which is precisely the recovery that makes
       the pair fine.

       A session with no data at all also breaks the chain, deliberately: we
       cannot tell whether he trained, and this is a force-override to red.

       And it requires HIS OWN numbers. Imputed load still counts toward the
       ACWR and the score — a borrowed 9 means the squad found the session
       brutal and he was there — but two numbers he never gave should not
       force red on their own. */
    const recentSessions = sessions.filter(s => s.date >= d28ago);
    const last2Sessions = recentSessions.slice(-2);
    const last2HighRPE = last2Sessions.length === 2 &&
      last2Sessions.every(s => s.rpe >= 9 && s.real === true);

    if (acwr > 1.7 || (recentHeavyMatches.length >= 2) || last2HighRPE) {
      color = 'red';
    }

    const fiveDaysAgo = localDateStr(new Date(now.getTime() - 5 * 86400000));
    const noRecentMatch = !matchSessions.some(s => s.date >= fiveDaysAgo);
    if (noRecentMatch && acwr >= 0.9 && acwr <= 1.1 && rpeTrendScore >= 80) {
      color = 'green';
    }

    /* WHY the dot is the colour it is.
       The colour is not a function of the score — it comes from ACWR, four
       risk flags and three force-overrides — so two players can both show 72
       in different colours with nothing on screen explaining it. Naming the
       rule that fired turns that from a contradiction into information, and
       it is what lets the threshold question be settled with evidence rather
       than instinct: you can see which rule actually fires. */
    const reasons = [];
    if (color !== 'green') {
      if (acwr > 1.7) reasons.push('acwr_high');
      else if (acwr > 1.5) reasons.push('acwr_over');
      else if (acwr < 0.8) reasons.push('acwr_low');
      if (loadSpikeScore <= 30) reasons.push('spike');
      if (rpeTrendScore <= 40) reasons.push('trend');
      if (matchFatigueScore <= 40) reasons.push('fatigue');
      if (recentHeavyMatches.length >= 2) reasons.push('two_matches');
      if (last2HighRPE) reasons.push('hard_sessions');
      if (score < 55) reasons.push('low_score');
    }

    /* Enough of the player's OWN recent data to say anything.
       Two changes here, both about not bluffing:
         · only `real` sessions count. An estimate borrowed from team-mates
           fills a gap in the load curve; it is not evidence that THIS player
           is being monitored, and a score built entirely from other people
           would be a confident number about nobody.
         · it now expires. The acute week is the last week WITH DATA, not
           this week, so without a recency test someone who stopped
           submitting in May keeps a May score displayed as today's, for
           ever. Past 10 days it falls back to the grey "no data" dot. */
    var STALE_AFTER_DAYS = 10;
    var realSessions = sessions.filter(function(s) {
      return s.real && s.rpe != null && s.minutes != null;
    });
    var lastReal = realSessions.length ? realSessions[realSessions.length - 1].date : null;
    var daysSinceReal = lastReal ?
      Math.round((now - new Date(lastReal + 'T12:00:00')) / 86400000) : Infinity;
    var isStale = daysSinceReal > STALE_AFTER_DAYS;
    var hasData = allWeeks.length >= 2 && realSessions.length >= 3 && !isStale;

    return {
      score, color, acwr, loadRatioScore, matchFatigueScore, loadSpikeScore,
      rpeTrendScore, hasData: hasData, reasons: reasons,
      // True when some of the load above was borrowed from team-mates, so
      // the cell can say so rather than presenting an estimate as a reading.
      estimated: sessions.some(function (x) { return x.estimated; }),
      matchDaysSince: matchDaysSince,
      // Training below their own four-week average. Not a risk flag — the
      // response is to build them up, not to protect them — so it gets its
      // own list rather than the amber dot.
      underloaded: hasData && acwr > 0 && acwr < 0.8,
    };
  }

  // crSplinePath → utils.js

  function buildChartsHtml(sessions, opts) {
    opts = opts || {};
    // --- RPE per Session chart ---
    let chartHtml = '';
    const yAxisW = window.innerWidth < 600 ? 30 : 46;
    const sessionsByDate = {};
    sessions.forEach(s => {
      if (!sessionsByDate[s.date]) sessionsByDate[s.date] = [];
      sessionsByDate[s.date].push(s);
    });
    const uniqueDates = Object.keys(sessionsByDate).sort();
    const yMax = 10;
    const count = uniqueDates.length;
    const isMobile = window.innerWidth < 600;
    const chartW = Math.max(count * (isMobile ? 28 : 40), isMobile ? 200 : 400);

    if (count) {
      const chartH = 200;
      const padL = isMobile ? 4 : 8, padR = isMobile ? 14 : 12, padT = 16, padB = 4;
      const plotW = chartW - padL - padR;
      const plotH = chartH - padT - padB;

      function sx(i) { return padL + (count === 1 ? plotW / 2 : (i / (count - 1)) * plotW); }
      function sy(rpe) { return padT + plotH - (rpe / yMax) * plotH; }

      let yAxisSvg = '';
      for (let v = 0; v <= 10; v += 2) {
        const y = sy(v);
        yAxisSvg += '<text x="' + (yAxisW - 4) + '" y="' + (y + 4) + '" text-anchor="end" class="rpe-y-text">' + v + '</text>';
      }

      let colsSvg = '';
      const colW = count === 1 ? plotW : plotW / (count - 1);
      const halfCol = colW / 2;
      // Merge consecutive columns of the same type into single rects to avoid gaps
      let runType = null, runStart = -1;
      function flushRun(endIdx) {
        if (runType === null) return;
        const x1 = runStart === 0 ? sx(0) : sx(runStart) - halfCol;
        const x2 = endIdx === count - 1 ? sx(count - 1) : sx(endIdx) + halfCol;
        const cls = runType === 'injured' ? 'rpe-col-injured' : 'rpe-col-skipped';
        colsSvg += '<rect x="' + x1 + '" y="' + padT + '" width="' + (x2 - x1) + '" height="' + plotH + '" class="' + cls + '"/>';
        runType = null;
      }
      uniqueDates.forEach((date, i) => {
        const group = sessionsByDate[date];
        const anyInjured = group.some(s => s.injured);
        const anySkipped = group.some(s => s.skipped);
        const t = anyInjured ? 'injured' : anySkipped ? 'skipped' : null;
        if (t !== runType) { flushRun(i - 1); runType = t; runStart = i; }
      });
      flushRun(count - 1);

      // Build line segments, breaking at skipped/injured dates
      const lineSegments = [];
      let currentSeg = [];
      uniqueDates.forEach((date, i) => {
        const group = sessionsByDate[date];
        const anyInjured = group.some(s => s.injured);
        const anySkipped = group.some(s => s.skipped);
        if (anyInjured || anySkipped) {
          if (currentSeg.length) { lineSegments.push(currentSeg); currentSeg = []; }
          return;
        }
        const withRpe = group.filter(s => s.rpe != null);
        if (withRpe.length) {
          const totalMin = withRpe.reduce((s, x) => s + (x.minutes || 1), 0);
          const avgRpe = withRpe.reduce((s, x) => s + x.rpe * (x.minutes || 1), 0) / totalMin;
          currentSeg.push({ x: sx(i), y: sy(avgRpe) });
        }
      });
      if (currentSeg.length) lineSegments.push(currentSeg);

      let lineSvg = '';
      lineSegments.forEach(seg => {
        if (seg.length < 2) return;
        lineSvg += '<path d="' + crSplinePath(seg) + '" class="rpe-line"/>';
      });

      let dotsSvg = '';
      uniqueDates.forEach((date, i) => {
        const group = sessionsByDate[date];
        const withRpe = group.filter(s => s.rpe != null);
        if (!withRpe.length) return;
        const totalMin = withRpe.reduce((s, x) => s + (x.minutes || 1), 0);
        const avgRpe = withRpe.reduce((s, x) => s + x.rpe * (x.minutes || 1), 0) / totalMin;
        const cx = sx(i), cy = sy(avgRpe);
        var cls;
        if (opts.teamView) {
          cls = withRpe.some(s => s.type === 'match') ? 'rpe-dot-match' : 'rpe-dot-training';
        } else {
          const isMulti = withRpe.length > 1;
          cls = isMulti ? 'rpe-dot-multi' : (withRpe[0].type === 'match' ? 'rpe-dot-match' : 'rpe-dot-training');
        }
        const tipLines = withRpe.map(s => sanitize(s.label) + ' — RPE ' + s.rpe + ' · ' + (s.minutes || '?') + ' min').join('<br>');
        dotsSvg += '<circle cx="' + cx + '" cy="' + cy + '" r="5" class="rpe-dot ' + cls + '" data-ua-tip="' + tipLines.replace(/"/g, '&quot;') + '"/>';
      });

      let xLabelsSvg = '';
      uniqueDates.forEach((date, i) => {
        const x = sx(i);
        const dt = new Date(date + 'T12:00:00');
        const dayName = tDayShort(dt.getDay());
        const yLabel = chartH + 12;
        xLabelsSvg += '<text x="' + x + '" y="' + yLabel + '" text-anchor="middle" class="rpe-x-text">' + dayName + '</text>';
      });

      const weekGroups = [];
      let curWk = null, wkStart = 0, wkCount = 0;
      const weekColors = ['#9fa8da','#80cbc4','#ef9a9a','#ce93d8','#90caf9','#ffab91','#a5d6a7','#f48fb1'];
      uniqueDates.forEach((date, i) => {
        const wk = getSeasonWeek(date);
        if (wk === curWk) { wkCount++; }
        else {
          if (curWk !== null) weekGroups.push({ wk: curWk, start: wkStart, count: wkCount });
          curWk = wk; wkStart = i; wkCount = 1;
        }
      });
      if (curWk !== null) weekGroups.push({ wk: curWk, start: wkStart, count: wkCount });

      let weekBadgesSvg = '';
      weekGroups.forEach((g, gi) => {
        const x1 = sx(g.start);
        const x2 = sx(g.start + g.count - 1);
        const cx = (x1 + x2) / 2;
        const yBadge = chartH + 22;
        const bg = weekColors[gi % weekColors.length];
        const bw = Math.max(x2 - x1 + 20, 24);
        weekBadgesSvg += '<rect x="' + (cx - bw/2) + '" y="' + yBadge + '" width="' + bw + '" height="16" rx="4" fill="' + bg + '"/>';
        weekBadgesSvg += '<text x="' + cx + '" y="' + (yBadge + 12) + '" text-anchor="middle" class="rpe-week-text">W' + g.wk + '</text>';
      });

      const svgH = chartH + 42;
      var legendItems = '<span class="ua-legend-item"><span class="ua-legend-dot" style="background:#81c784"></span>Training</span>'
        + '<span class="ua-legend-item"><span class="ua-legend-dot" style="background:#f57f17"></span>Match</span>';
      if (!opts.teamView) {
        legendItems += '<span class="ua-legend-item"><span class="ua-legend-dot" style="background:#64b5f6"></span>Multiple</span>'
          + '<span class="ua-legend-item"><span class="ua-legend-dot" style="background:#90a4ae"></span>Skipped</span>'
          + '<span class="ua-legend-item"><span class="ua-legend-dot" style="background:#e53935"></span>Injured</span>';
      }
      chartHtml = '<div class="card">'
        + '<div class="card-title">RPE per Session</div>'
        + '<div class="rpe-legend">' + legendItems + '</div>'
        + '<div class="rpe-chart-wrap">'
        + '<svg class="rpe-y-axis-svg" width="' + yAxisW + '" height="' + svgH + '" viewBox="0 0 ' + yAxisW + ' ' + svgH + '">' + yAxisSvg + '</svg>'
        + '<div class="rpe-chart-scroll">'
        + '<svg class="rpe-chart-svg" width="' + chartW + '" height="' + svgH + '" viewBox="0 0 ' + chartW + ' ' + svgH + '">'
        + colsSvg + lineSvg + dotsSvg + xLabelsSvg + weekBadgesSvg
        + '</svg></div></div></div>';
    } else {
      chartHtml = '<div class="card"><div class="card-title">RPE per Session</div>'
        + '<p style="color:var(--text-secondary);">No sessions recorded yet.</p></div>';
    }

    // --- UA per Week data (shared with ACWR) ---
    const weekUA = {};
    const allWeeks = [];
    sessions.forEach(s => {
      if (s.rpe == null || s.minutes == null) return;
      const wk = getSeasonWeek(s.date);
      if (!weekUA[wk]) weekUA[wk] = { ua: 0, details: [] };
      weekUA[wk].ua += s.rpe * s.minutes;
      weekUA[wk].details.push(s);
    });
    {
      const weekNums = Object.keys(weekUA).map(Number).sort((a, b) => a - b);
      if (weekNums.length) {
        for (let w = weekNums[0]; w <= weekNums[weekNums.length - 1]; w++) allWeeks.push(w);
      }
    }

    // --- UA per Week chart ---
    let uaWeekHtml = '';
    if (allWeeks.length) {
      const wCount = allWeeks.length;
      const uaValues = allWeeks.map(w => weekUA[w] ? weekUA[w].ua : 0);
      const uaMax = Math.max(...uaValues, 100);
      const uaCeil = Math.ceil(uaMax / 200) * 200;

      const wMobile = window.innerWidth < 600;
      const wYAxisW = wMobile ? 30 : 46;
      const wChartW = wMobile ? Math.max(wCount * 48, 200) : Math.max(wCount * 52, 400);
      const wChartH = 200;
      const wPadL = wMobile ? 4 : 8, wPadR = wMobile ? 14 : 12, wPadT = 16, wPadB = 4;
      const wPlotW = wChartW - wPadL - wPadR;
      const wPlotH = wChartH - wPadT - wPadB;

      function wsx(i) { return wPadL + (wCount === 1 ? wPlotW / 2 : (i / (wCount - 1)) * wPlotW); }
      function wsy(v) { return wPadT + wPlotH - (v / uaCeil) * wPlotH; }

      let wYAxisSvg = '';
      const yStep = uaCeil <= 600 ? 100 : uaCeil <= 1500 ? 200 : 500;
      for (let v = 0; v <= uaCeil; v += yStep) {
        const y = wsy(v);
        wYAxisSvg += '<text x="' + (wYAxisW - 4) + '" y="' + (y + 4) + '" text-anchor="end" class="rpe-y-text">' + v + '</text>';
      }

      const wLinePoints = [];
      allWeeks.forEach((w, i) => {
        wLinePoints.push({ x: wsx(i), y: wsy(uaValues[i]) });
      });

      let wLineSvg = '';
      if (wLinePoints.length > 1) {
        wLineSvg = '<path d="' + crSplinePath(wLinePoints) + '" class="rpe-line" style="stroke:#fb8c00"/>';
      }

      let wDotsSvg = '';
      allWeeks.forEach((w, i) => {
        const cx = wsx(i), cy = wsy(uaValues[i]);
        const wData = weekUA[w];
        let tip = 'UA ' + uaValues[i];
        if (wData && wData.details.length) {
          tip = wData.details.map(s => sanitize(s.label) + ' — RPE ' + s.rpe + ' × ' + (s.minutes || '?') + 'min').join('<br>');
          tip += '<br><b>Total UA: ' + uaValues[i] + '</b>';
        }
        const dotCls = uaValues[i] === 0 ? 'rpe-dot' : 'rpe-dot rpe-dot-ua';
        wDotsSvg += '<circle cx="' + cx + '" cy="' + cy + '" r="5" class="' + dotCls + '" data-ua-tip="' + tip.replace(/"/g, '&quot;') + '"/>';
      });

      let wXLabelsSvg = '';
      allWeeks.forEach((w, i) => {
        const x = wsx(i);
        wXLabelsSvg += '<text x="' + x + '" y="' + (wChartH + 14) + '" text-anchor="middle" class="rpe-x-text">W' + w + '</text>';
      });

      const wSvgH = wChartH + 22;
      uaWeekHtml = '<div class="card">'
        + '<div class="card-title">UA per Week</div>'
        + '<div class="rpe-chart-wrap">'
        + '<svg class="rpe-y-axis-svg" width="' + wYAxisW + '" height="' + wSvgH + '" viewBox="0 0 ' + wYAxisW + ' ' + wSvgH + '">' + wYAxisSvg + '</svg>'
        + '<div class="rpe-chart-scroll">'
        + '<svg class="rpe-chart-svg" width="' + wChartW + '" height="' + wSvgH + '" viewBox="0 0 ' + wChartW + ' ' + wSvgH + '">'
        + wLineSvg + wDotsSvg + wXLabelsSvg
        + '</svg></div></div></div>';
    }

    // --- ACWR chart ---
    let acwrHtml = '';
    if (allWeeks.length >= 2) {
      const acuteArr = [];
      const chronicArr = [];
      const ratioArr = [];
      allWeeks.forEach((w, i) => {
        const acute = weekUA[w] ? weekUA[w].ua : 0;
        let sum4 = 0, cnt4 = 0;
        for (let j = i; j >= Math.max(0, i - 3); j--) {
          sum4 += weekUA[allWeeks[j]] ? weekUA[allWeeks[j]].ua : 0;
          cnt4++;
        }
        const chronic = cnt4 ? sum4 / cnt4 : 0;
        acuteArr.push(acute);
        chronicArr.push(chronic);
        ratioArr.push(chronic > 0 ? +(acute / chronic).toFixed(2) : 0);
      });

      const acwrCount = allWeeks.length;
      const acwrMobile = window.innerWidth < 600;
      const acwrYAxisW = acwrMobile ? 30 : 46;
      const acwrRAxisW = acwrMobile ? 28 : 40;
      const acwrChartW = acwrCount <= 1 ? 80 : acwrCount * (acwrMobile ? 42 : 60);
      const acwrChartH = 220;
      const acwrPadL = acwrMobile ? 8 : 24, acwrPadR = acwrMobile ? 14 : 30, acwrPadT = 16, acwrPadB = 4;
      const acwrPlotW = acwrChartW - acwrPadL - acwrPadR;
      const acwrPlotH = acwrChartH - acwrPadT - acwrPadB;

      const uaMaxAcwr = Math.max(...acuteArr, ...chronicArr, 100);
      const uaCeilAcwr = Math.ceil(uaMaxAcwr / 200) * 200;
      const ratioMax = Math.max(...ratioArr, 2);
      const ratioCeil = Math.ceil(ratioMax * 2) / 2;

      function acwrSx(i) { return acwrPadL + (acwrCount === 1 ? acwrPlotW / 2 : (i / (acwrCount - 1)) * acwrPlotW); }
      function acwrSy(v) { return acwrPadT + acwrPlotH - (v / uaCeilAcwr) * acwrPlotH; }
      function ratioSy(v) { return acwrPadT + acwrPlotH - (v / ratioCeil) * acwrPlotH; }

      let acwrYAxisSvg = '';
      const acwrYStep = uaCeilAcwr <= 600 ? 100 : uaCeilAcwr <= 1500 ? 200 : 500;
      for (let v = 0; v <= uaCeilAcwr; v += acwrYStep) {
        acwrYAxisSvg += '<text x="' + (acwrYAxisW - 4) + '" y="' + (acwrSy(v) + 4) + '" text-anchor="end" class="rpe-y-text">' + v + '</text>';
      }

      let acwrRAxisSvg = '';
      for (let v = 0; v <= ratioCeil; v += 1) {
        const y = ratioSy(v);
        acwrRAxisSvg += '<text x="' + (acwrRAxisW - 10) + '" y="' + (y + 4) + '" text-anchor="end" class="rpe-y-text">' + v.toFixed(1) + '</text>';
      }

      const zoneTop = ratioSy(Math.min(1.3, ratioCeil));
      const zoneBot = ratioSy(0.8);
      const zoneH = Math.max(zoneBot - zoneTop, 0);
      const orangeTopTop = ratioSy(Math.min(1.5, ratioCeil));
      const orangeTopBot = ratioSy(Math.min(1.3, ratioCeil));
      const orangeTopH = Math.max(orangeTopBot - orangeTopTop, 0);
      const orangeBotTop = ratioSy(0.8);
      const orangeBotBot = ratioSy(0.7);
      const orangeBotH = Math.max(orangeBotBot - orangeBotTop, 0);
      const redTopTop = ratioSy(ratioCeil);
      const redTopBot = ratioSy(Math.min(1.5, ratioCeil));
      const redTopH = Math.max(redTopBot - redTopTop, 0);
      const redBotTop = ratioSy(0.7);
      const redBotBot = ratioSy(0);
      const redBotH = Math.max(redBotBot - redBotTop, 0);
      const zoneSvg = '<rect x="0" y="' + redTopTop + '" width="' + acwrChartW + '" height="' + redTopH + '" fill="#e53935" opacity=".14"/>'
        + '<rect x="0" y="' + redBotTop + '" width="' + acwrChartW + '" height="' + redBotH + '" fill="#e53935" opacity=".14"/>'
        + '<rect x="0" y="' + zoneTop + '" width="' + acwrChartW + '" height="' + zoneH + '" fill="#81c784" opacity=".22"/>'
        + '<line x1="0" y1="' + zoneTop + '" x2="' + acwrChartW + '" y2="' + zoneTop + '" stroke="#4caf50" stroke-width="1" opacity=".5"/>'
        + '<line x1="0" y1="' + zoneBot + '" x2="' + acwrChartW + '" y2="' + zoneBot + '" stroke="#4caf50" stroke-width="1" opacity=".5"/>'
        + '<rect x="0" y="' + orangeTopTop + '" width="' + acwrChartW + '" height="' + orangeTopH + '" fill="#ff9800" opacity=".15"/>'
        + '<line x1="0" y1="' + orangeTopTop + '" x2="' + acwrChartW + '" y2="' + orangeTopTop + '" stroke="#ff9800" stroke-width="1" opacity=".45"/>'
        + '<rect x="0" y="' + orangeBotTop + '" width="' + acwrChartW + '" height="' + orangeBotH + '" fill="#ff9800" opacity=".15"/>'
        + '<line x1="0" y1="' + orangeBotBot + '" x2="' + acwrChartW + '" y2="' + orangeBotBot + '" stroke="#ff9800" stroke-width="1" opacity=".45"/>';
      const zoneLineR = '<line x1="0" y1="' + zoneTop + '" x2="' + (acwrRAxisW * 0.25) + '" y2="' + zoneTop + '" stroke="#4caf50" stroke-width="1" opacity=".5"/>'
        + '<line x1="0" y1="' + zoneBot + '" x2="' + (acwrRAxisW * 0.25) + '" y2="' + zoneBot + '" stroke="#4caf50" stroke-width="1" opacity=".5"/>'
        + '<line x1="0" y1="' + orangeTopTop + '" x2="' + (acwrRAxisW * 0.25) + '" y2="' + orangeTopTop + '" stroke="#ff9800" stroke-width="1" opacity=".45"/>'
        + '<line x1="0" y1="' + orangeBotBot + '" x2="' + (acwrRAxisW * 0.25) + '" y2="' + orangeBotBot + '" stroke="#ff9800" stroke-width="1" opacity=".45"/>';

      acwrRAxisSvg += '<text x="12" y="' + (zoneTop + 4) + '" text-anchor="start" class="rpe-y-text" style="fill:#4caf50;font-weight:600;font-size:9px">1.3</text>';
      acwrRAxisSvg += '<text x="12" y="' + (zoneBot + 4) + '" text-anchor="start" class="rpe-y-text" style="fill:#4caf50;font-weight:600;font-size:9px">0.8</text>';
      acwrRAxisSvg += '<text x="12" y="' + (orangeTopTop + 4) + '" text-anchor="start" class="rpe-y-text" style="fill:#ff9800;font-weight:600;font-size:9px">1.5</text>';
      acwrRAxisSvg += '<text x="12" y="' + (orangeBotBot + 4) + '" text-anchor="start" class="rpe-y-text" style="fill:#ff9800;font-weight:600;font-size:9px">0.7</text>';

      const barW = Math.max(acwrPlotW / acwrCount * 0.28, 6);
      let colsSvgAcwr = '';
      allWeeks.forEach((w, i) => {
        const x = acwrSx(i);
        const acuteH = (acuteArr[i] / uaCeilAcwr) * acwrPlotH;
        const chronicH = (chronicArr[i] / uaCeilAcwr) * acwrPlotH;
        const acuteY = acwrPadT + acwrPlotH - acuteH;
        const chronicY = acwrPadT + acwrPlotH - chronicH;
        colsSvgAcwr += '<rect x="' + (x - barW - 1) + '" y="' + acuteY + '" width="' + barW + '" height="' + acuteH + '" rx="2" class="acwr-bar-acute" data-ua-tip="Acute: ' + Math.round(acuteArr[i]) + '"/>';
        colsSvgAcwr += '<rect x="' + (x + 1) + '" y="' + chronicY + '" width="' + barW + '" height="' + chronicH + '" rx="2" class="acwr-bar-chronic" data-ua-tip="Chronic: ' + Math.round(chronicArr[i]) + '"/>';
      });

      const ratioPoints = allWeeks.map((w, i) => ({ x: acwrSx(i), y: ratioSy(ratioArr[i]) }));
      let ratioLineSvg = '';
      if (ratioPoints.length > 1) {
        ratioLineSvg = '<path d="' + crSplinePath(ratioPoints) + '" class="rpe-line" style="stroke:#fb8c00"/>';
      }

      let ratioDotsSvg = '';
      allWeeks.forEach((w, i) => {
        const cx = acwrSx(i), cy = ratioSy(ratioArr[i]);
        const tip = 'Acute: ' + Math.round(acuteArr[i]) + ' · Chronic: ' + Math.round(chronicArr[i]) + ' · Ratio: ' + ratioArr[i].toFixed(2);
        ratioDotsSvg += '<circle cx="' + cx + '" cy="' + cy + '" r="5" class="rpe-dot rpe-dot-ua" data-ua-tip="' + sanitize(tip).replace(/"/g, '&quot;') + '"/>';
      });

      let acwrXSvg = '';
      allWeeks.forEach((w, i) => {
        acwrXSvg += '<text x="' + acwrSx(i) + '" y="' + (acwrChartH + 14) + '" text-anchor="middle" class="rpe-x-text">W' + w + '</text>';
      });

      const acwrSvgH = acwrChartH + 22;
      acwrHtml = '<div class="card">'
        + '<div class="card-title">Acute/Chronic Workload Ratio</div>'
        + '<div class="rpe-legend">'
        + '<span class="ua-legend-item"><span class="ua-legend-dot" style="background:#ef9a9a"></span>Acute</span>'
        + '<span class="ua-legend-item"><span class="ua-legend-dot" style="background:#90caf9"></span>Chronic</span>'
        + '<span class="ua-legend-item"><span class="ua-legend-dot" style="background:#fb8c00;border-radius:50%"></span>Ratio</span>'
        + '<span class="ua-legend-item"><span class="ua-legend-dot" style="background:#c8e6c9"></span>Optimal<span class="legend-range"> (0.8–1.3)</span></span>'
        + '<span class="ua-legend-item"><span class="ua-legend-dot" style="background:#ffe0b2"></span>Caution<span class="legend-range"> (0.7–0.8 / 1.3–1.5)</span></span>'
        + '<span class="ua-legend-item"><span class="ua-legend-dot" style="background:#ffcdd2"></span>Danger<span class="legend-range"> (&lt;0.7 / &gt;1.5)</span></span>'
        + '</div>'
        + '<div class="rpe-chart-wrap">'
        + '<svg class="rpe-y-axis-svg" width="' + acwrYAxisW + '" height="' + acwrSvgH + '" viewBox="0 0 ' + acwrYAxisW + ' ' + acwrSvgH + '">' + acwrYAxisSvg + '</svg>'
        + '<div class="rpe-chart-scroll" style="flex:0 1 ' + acwrChartW + 'px">'
        + '<svg class="rpe-chart-svg" width="' + acwrChartW + '" height="' + acwrSvgH + '" viewBox="0 0 ' + acwrChartW + ' ' + acwrSvgH + '">'
        + zoneSvg + colsSvgAcwr + ratioLineSvg + ratioDotsSvg + acwrXSvg
        + '</svg></div>'
        + '<svg class="rpe-y-axis-svg" width="' + acwrRAxisW + '" height="' + acwrSvgH + '" viewBox="0 0 ' + acwrRAxisW + ' ' + acwrSvgH + '"><rect x="0" y="' + redTopTop + '" width="' + (acwrRAxisW * 0.25) + '" height="' + redTopH + '" fill="#e53935" opacity=".14"/><rect x="0" y="' + redBotTop + '" width="' + (acwrRAxisW * 0.25) + '" height="' + redBotH + '" fill="#e53935" opacity=".14"/><rect x="0" y="' + zoneTop + '" width="' + (acwrRAxisW * 0.25) + '" height="' + zoneH + '" fill="#81c784" opacity=".22"/><rect x="0" y="' + orangeTopTop + '" width="' + (acwrRAxisW * 0.25) + '" height="' + orangeTopH + '" fill="#ff9800" opacity=".15"/><rect x="0" y="' + orangeBotTop + '" width="' + (acwrRAxisW * 0.25) + '" height="' + orangeBotH + '" fill="#ff9800" opacity=".15"/>' + zoneLineR + acwrRAxisSvg + '</svg>'
        + '</div></div>';
    }

    return { rpe: chartHtml, uaWeek: uaWeekHtml, acwr: acwrHtml };
  }

  /* Injury history card + the body map beside it, for ONE player.
     Shared by "My stats" (the player's own) and the staff view of a player
     reached from Manage roster — same markup, so bindMyStatsInjuryPopup()
     wires the hover popup on either page. */
  function buildInjuryHistoryHtml(uid) {
    const now = new Date();
    const playerInjuries = getPlayerInjuries(uid)
      .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));

    let injuryListHtml = '';
    if (playerInjuries.length === 0) {
      injuryListHtml = '<div style="padding:.8rem;color:var(--text-secondary);font-size:.85rem;">' + t('stats.no_injuries') + '</div>';
    } else {
      injuryListHtml = playerInjuries.map(inj => {
        const startD = new Date(inj.startDate + 'T12:00:00');
        const endD = inj.endDate ? new Date(inj.endDate + 'T12:00:00') : now;
        const days = Math.max(1, Math.floor((endD - startD) / 86400000) + 1);
        const startStr = tDateDayMonth(inj.startDate);
        const endStr = inj.status === 'resolved' ? (inj.endDate ? tDateDayMonth(inj.endDate) : '?') : t('stats.present');
        const durationStr = inj.status !== 'resolved' ? (days + ' days so far') : (days === 1 ? '1 day' : days + ' days');
        const note = inj.muscleGroup ? (inj.muscleGroup + (inj.muscleSub ? ' (' + inj.muscleSub + ')' : '')) : 'Injury';
        const sevColors = { minor: '#43a047', moderate: '#f9a825', severe: '#e53935' };
        const statusColors = { active: '#ef5350', recovering: '#f9a825', resolved: '#66bb6a' };
        const statusDot = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + (statusColors[inj.status] || '#999') + ';margin-right:6px;"></span>';
        const sevDot = '<span class="med-severity-badge med-severity-sm" style="background:' + (sevColors[inj.severity] || '#999') + ';margin-left:6px;">' + (inj.severity || '') + '</span>';
        return `<div class="mystats-inj-row" data-zone-idx="${inj.bodyZone != null ? inj.bodyZone : ''}" style="display:flex;align-items:center;justify-content:space-between;padding:.5rem 0;border-bottom:1px solid var(--border);font-size:.82rem;cursor:help;">
          <div style="display:flex;align-items:center;">${statusDot}<span>${sanitize(note)}</span>${sevDot}</div>
          <div style="text-align:right;color:var(--text-secondary);font-size:.75rem;">${startStr} – ${endStr}<br><strong>${durationStr}</strong></div>
        </div>`;
      }).join('');
    }

    // Body map SVG with a blinking dot on the current injury zone
    const activePlayerInj = playerInjuries.find(inj => inj.status === 'active');
    const currentZoneIdx = activePlayerInj ? activePlayerInj.bodyZone : null;
    let bodyMapHtml = '';
    if (activePlayerInj && currentZoneIdx != null && BODY_ZONES[currentZoneIdx]) {
      const zone = BODY_ZONES[currentZoneIdx];
      // Compute centroid of the polygon
      const pairs = zone.pts.split(/\s+/).map(p => p.split(',').map(Number));
      let cx = 0, cy = 0;
      pairs.forEach(([x, y]) => { cx += x; cy += y; });
      cx = (cx / pairs.length).toFixed(1);
      cy = (cy / pairs.length).toFixed(1);
      bodyMapHtml = `<div class="mystats-body-map">
        <div style="position:relative;display:inline-block;line-height:0;">
          <img src="img/cuerpos.png" style="display:block;height:180px;pointer-events:none;" />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;top:0;left:0;width:100%;height:100%;">
            <polygon points="${zone.pts}" fill="rgba(239,83,80,.25)" stroke="#ef5350" stroke-width=".5"/>
            <circle cx="${cx}" cy="${cy}" r="1.8" class="mystats-injury-dot"/>
          </svg>
        </div>
      </div>`;
    }

    return `
      <div class="mystats-injury-row" style="margin-top:1rem;">
        <div class="card mystats-injury-card">
          <div class="card-title" style="margin-bottom:.4rem;font-size:.85rem;">${t('stats.injury_history')}</div>
          ${injuryListHtml}
        </div>
        ${bodyMapHtml}
      </div>`;
  }

  /**
   * The Ready cell: one dot, one score, one tooltip — shared by the roster,
   * the training-detail attendance table and the convocatòria.
   *
   * Extracted because those three rendered it near-identically and had
   * drifted: all of them painted a player with NO data green, which on a
   * freshly wiped club meant a whole squad reading as fully ready when the
   * app knew nothing about any of them. One template, so they cannot drift
   * again.
   *
   * Readiness stays a pure training-LOAD metric and deliberately does not
   * read the injury log — an injured player keeps whatever colour their load
   * earns. But the two columns sitting side by side, one red and one green,
   * is what made this confusing, so an injured player's cell carries an
   * explicit warning.
   *
   * @param {Object} rd Result of computeReadiness().
   * @param {boolean} [injured] True when deriveFitnessStatus() says injured.
   */
  function readinessCellHtml(rd, injured) {
    const tips = [];
    if (injured) tips.push(t('readiness.injured_warning'));
    if (!rd.hasData) tips.push(t('readiness.no_data'));
    // Name the rule that fired. The colour is not a function of the score,
    // so without this two players can both show 72 in different colours and
    // it reads as a bug rather than as information.
    (rd.reasons || []).forEach((r) => tips.push(t('rd.' + r)));
    if (rd.hasData && rd.estimated) tips.push(t('rd.estimated'));
    const tip = tips.length ? ` data-tooltip="${sanitize(tips.join(' · '))}"` : '';
    // No data is grey and carries no number: a dash still occupies the
    // column as though it were a reading, and green actively misinforms.
    if (!rd.hasData) {
      return `<span class="readiness-cell"><span class="readiness-dot readiness-nodata"${tip}></span></span>`;
    }
    return `<span class="readiness-cell"><span class="readiness-dot readiness-${rd.color}"${tip}></span>` +
      `<span class="readiness-score readiness-score-${rd.color}">${rd.score}</span></span>`;
  }

  function buildReadinessCard(rd) {
    if (!rd.hasData) {
      return `<div class="card">
        <div class="card-title">${t('readiness.title')}</div>
        <p style="color:var(--text-secondary);text-align:center;padding:1.5rem 0;">${t('readiness.no_data')}</p>
      </div>`;
    }
    const colorLabel = rd.color === 'green' ? t('readiness.good')
      : rd.color === 'orange' ? t('readiness.moderate') : t('readiness.low');
    const colorHex = rd.color === 'green' ? '#4caf50' : rd.color === 'orange' ? '#ff9800' : '#e53935';
    function bar(val) {
      const bg = val >= 75 ? '#4caf50' : val >= 55 ? '#ff9800' : '#e53935';
      return `<div class="rd-bar-track"><div class="rd-bar-fill" style="width:${val}%;background:${bg}"></div></div>`;
    }
    return `<div class="card">
      <div class="card-title">Readiness</div>
      <div class="rd-header">
        <span class="readiness-dot readiness-${rd.color}"></span>
        <span class="rd-score" style="color:${colorHex}">${rd.score}</span>
        <span class="rd-label" style="color:${colorHex}">${colorLabel}</span>
        <span class="rd-acwr">ACWR ${rd.acwr.toFixed(2)}</span>
      </div>
      <div class="rd-metrics">
        <div class="rd-metric"><span class="rd-metric-label" data-tooltip="Based on ACWR: 0.8–1.3 = 100, &lt;0.8 = 60, 1.3–1.5 = 70, &gt;1.5 = 30">Load Ratio</span><span class="rd-metric-val">${rd.loadRatioScore}</span>${bar(rd.loadRatioScore)}</div>
        <div class="rd-metric"><span class="rd-metric-label" data-tooltip="Minutes in last match + recency penalty. &gt;80 min = 40, 60–80 = 60, 30–60 = 80, &lt;30 = 100">Match Fatigue</span><span class="rd-metric-val">${rd.matchFatigueScore}</span>${bar(rd.matchFatigueScore)}</div>
        <div class="rd-metric"><span class="rd-metric-label" data-tooltip="Week-over-week load change. &gt;+30% = 30, +10–30% = 60, ±10% = 100, &lt;-10% = 80">Load Spike</span><span class="rd-metric-val">${rd.loadSpikeScore}</span>${bar(rd.loadSpikeScore)}</div>
        <div class="rd-metric"><span class="rd-metric-label" data-tooltip="RPE trend over last 28 days. Sharp increase = 40, mild = 60, stable = 80, decreasing = 100">RPE Trend</span><span class="rd-metric-val">${rd.rpeTrendScore}</span>${bar(rd.rpeTrendScore)}</div>
      </div>
    </div>`;
  }

  function renderPlayerStats() {
    const session = getSession();
    // Compute live stats from match events
    const computed = session ? computePlayerMatchStats(session.id) : { totals: { goals: 0, assists: 0, matches: 0, minutes: 0 }, matchRows: [] };
    const ct = computed.totals;
    const matchTableHtml = buildMatchHistoryTable(computed.matchRows);

    // --- RPE line chart (since season start) ---
    const rpeData = JSON.parse(localStorage.getItem('fa_player_rpe') || '{}');
    const uid = session ? session.id : '';
    const now = new Date();
    const trainingList = getTrainings();
    const matchesList = JSON.parse(localStorage.getItem('fa_matches') || '[]');
    const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
    const staffOverrides = JSON.parse(localStorage.getItem('fa_training_staff_override') || '{}');
    const matchAvailData = JSON.parse(localStorage.getItem('fa_match_availability') || '{}');

    const todayStr = localDateStr(now);

    // Season start: Aug 15 of current season year
    const seasonStart = seasonStartStr(now);

    // Collect all sessions (training + matches) since season start, sorted by date
    const sessions = [];
    trainingList.forEach(t => {
      if (!t.date || t.date < seasonStart || t.date > todayStr) return;
      const avail = readRecord(staffOverrides, uid, t, 'avail') ||
        readRecord(availData, uid, t, 'avail') || '';
      const excluded = avail === 'no' || avail === 'injured';
      const entry = excluded ? null : readRecord(rpeData, uid, t, 'rpe');
      sessions.push({
        date: t.date,
        type: 'training',
        label: t.focus || 'Training',
        rpe: entry ? entry.rpe : null,
        minutes: entry ? entry.minutes : null,
        skipped: avail === 'no',
        injured: avail === 'injured'
      });
    });
    matchesList.forEach(m => {
      if (!m.date || m.date < seasonStart || m.date > todayStr) return;
      const rpeKey = uid + '_match_' + m.id;
      const maKey = uid + '_' + m.id;
      const avail = matchAvailData[maKey] || '';
      const entry = rpeData[rpeKey];
      sessions.push({
        date: m.date,
        type: 'match',
        label: (m.home || '') + ' vs ' + (m.away || ''),
        rpe: entry ? entry.rpe : null,
        minutes: entry ? entry.minutes : null,
        skipped: avail === 'no_disponible',
        injured: false
      });
    });
    // Extra training sessions
    Object.keys(rpeData).forEach(key => {
      if (!key.startsWith(uid + '_extra_')) return;
      const entry = rpeData[key];
      if (!entry || !entry.date || entry.date < seasonStart || entry.date > todayStr) return;
      sessions.push({
        date: entry.date,
        type: 'extra',
        label: entry.tag || 'Extra',
        rpe: entry.rpe,
        minutes: entry.minutes,
        skipped: false,
        injured: false
      });
    });
    sessions.sort((a, b) => a.date.localeCompare(b.date));

    const charts = buildChartsHtml(sessions);
    const acwrHtml = charts.acwr, chartHtml = charts.rpe, uaWeekHtml = charts.uaWeek;
    const rd = computeReadiness(uid);
    const readinessHtml = buildReadinessCard(rd);

    // Position circles
    const users = getUsers();
    const myUser = users.find(u => u.id === uid);
    const posHtml = myUser ? posCirclesHtmlGlobal(myUser) : '';

    // Attendance donut (reuse same logic as Player Overview)
    let pYes = 0, pLate = 0, pNo = 0, pInj = 0, pNa = 0;
    const _ctxStats = availContext();
    trainingList.forEach(t => {
      if (!t.date) return;
      const locked = isTrainingLocked(t);
      const v = getEffectiveAnswer(uid, t, locked, _ctxStats);
      if (v === 'yes') pYes++;
      else if (v === 'late') pLate++;
      else if (v === 'no') pNo++;
      else if (v === 'injured') pInj++;
      else pNa++;
    });
    const pTotal = pYes + pLate + pNo + pInj + pNa;
    let attendDonutHtml = '';
    if (pTotal > 0) {
      const dSize = 100, dStroke = 16, dRadius = (dSize - dStroke) / 2;
      const dCirc = 2 * Math.PI * dRadius;
      const dSegs = [
        { count: pYes, color: '#66bb6a', label: t('avail.yes') },
        { count: pLate, color: '#ffa726', label: t('avail.late') },
        { count: pNo, color: '#78909c', label: t('avail.no') },
        { count: pInj, color: '#ef5350', label: t('avail.injured') },
        { count: pNa, color: '#d0d0d0', label: t('avail.na') }
      ];
      let dArcs = '', dOff = 0;
      dSegs.forEach(s => {
        if (s.count > 0) {
          const len = (s.count / pTotal) * dCirc;
          const sPct = Math.round((s.count / pTotal) * 100);
          dArcs += `<circle cx="${dSize/2}" cy="${dSize/2}" r="${dRadius}" fill="none" stroke="${s.color}" stroke-width="${dStroke}"
            stroke-dasharray="${len} ${dCirc - len}" stroke-dashoffset="${-dOff}"
            style="--circ:${dCirc};cursor:pointer;pointer-events:stroke" transform="rotate(-90 ${dSize/2} ${dSize/2})" data-tooltip="${s.label}: ${sPct}%"><title>${s.label}: ${sPct}%</title></circle>`;
          dOff += len;
        }
      });
      const attendPct = Math.round(((pYes + pLate) / pTotal) * 100);
      attendDonutHtml = `<div style="display:flex;flex-direction:column;align-items:center;gap:.3rem;">
        <div class="assistance-circle" style="width:${dSize}px;height:${dSize}px;">
          <svg width="${dSize}" height="${dSize}" viewBox="0 0 ${dSize} ${dSize}">
            <circle cx="${dSize/2}" cy="${dSize/2}" r="${dRadius}" fill="none" stroke="var(--border)" stroke-width="${dStroke}"/>
            ${dArcs}
          </svg>
          <span class="assistance-pct po-pct-counter" data-target="${attendPct}" style="font-size:1.1rem;font-weight:800;">0%</span>
        </div>
        <span style="font-size:.65rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.03em;">Attendance</span>
      </div>`;
    }

    // Injury history + body map → buildInjuryHistoryHtml, shared with the
    // staff view of the same player.

    return `
      <h2 class="page-title">${t('page.my_stats')}</h2>
      <div class="card mystats-summary">
        <div class="mystats-summary-left">
          <div class="mystats-pos-row"><span class="conv-pos-circles">${posHtml}</span></div>
          <div class="mystats-nums">
            <div class="mystats-num"><span class="mystats-num-val">${ct.goals}</span><span class="mystats-num-lbl">${t('stats.goals')}</span></div>
            <div class="mystats-num"><span class="mystats-num-val">${ct.assists}</span><span class="mystats-num-lbl">${t('stats.assists')}</span></div>
            <div class="mystats-num"><span class="mystats-num-val">${ct.matches}</span><span class="mystats-num-lbl">${t('stats.matches')}</span></div>
            <div class="mystats-num"><span class="mystats-num-val">${ct.titulars}</span><span class="mystats-num-lbl">${t('stats.titular')}</span></div>
            <div class="mystats-num"><span class="mystats-num-val">${ct.minutes}</span><span class="mystats-num-lbl">${t('stats.minutes')}</span></div>
          </div>
        </div>
        ${attendDonutHtml}
      </div>
      ${matchTableHtml}
      ${buildInjuryHistoryHtml(uid)}
      ${readinessHtml}
      ${acwrHtml}
      ${chartHtml}
      ${uaWeekHtml}`;
  }

  function renderStaffPlayerStats() {
    const users = getUsers();
    const u = users.find(x => String(x.id) === String(staffViewPlayerId));
    if (!u) return '<div class="empty-state"><p>Player not found</p></div>';
    const uid = u.id;

    // Compute live stats from match events
    const computed = computePlayerMatchStats(uid);
    const ct = computed.totals;
    const matchTableHtml = buildMatchHistoryTable(computed.matchRows);

    const rpeData = JSON.parse(localStorage.getItem('fa_player_rpe') || '{}');
    const now = new Date();
    const trainingList = getTrainings();
    const matchesList = JSON.parse(localStorage.getItem('fa_matches') || '[]');
    const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
    const staffOverrides = JSON.parse(localStorage.getItem('fa_training_staff_override') || '{}');
    const matchAvailData = JSON.parse(localStorage.getItem('fa_match_availability') || '{}');

    const todayStr = localDateStr(now);
    const seasonStart = seasonStartStr(now);

    const sessions = [];
    trainingList.forEach(t => {
      if (!t.date || t.date < seasonStart || t.date > todayStr) return;
      const avail = readRecord(staffOverrides, uid, t, 'avail') ||
        readRecord(availData, uid, t, 'avail') || '';
      const excluded = avail === 'no' || avail === 'injured';
      const entry = excluded ? null : readRecord(rpeData, uid, t, 'rpe');
      sessions.push({
        date: t.date, type: 'training', label: t.focus || 'Training',
        rpe: entry ? entry.rpe : null, minutes: entry ? entry.minutes : null,
        skipped: avail === 'no', injured: avail === 'injured'
      });
    });
    matchesList.forEach(m => {
      if (!m.date || m.date < seasonStart || m.date > todayStr) return;
      const rpeKey = uid + '_match_' + m.id;
      const maKey = uid + '_' + m.id;
      const avail = matchAvailData[maKey] || '';
      const entry = rpeData[rpeKey];
      sessions.push({
        date: m.date, type: 'match', label: (m.home || '') + ' vs ' + (m.away || ''),
        rpe: entry ? entry.rpe : null, minutes: entry ? entry.minutes : null,
        skipped: avail === 'no_disponible', injured: false
      });
    });
    Object.keys(rpeData).forEach(key => {
      if (!key.startsWith(uid + '_extra_')) return;
      const entry = rpeData[key];
      if (!entry || !entry.date || entry.date < seasonStart || entry.date > todayStr) return;
      sessions.push({
        date: entry.date, type: 'extra', label: entry.tag || 'Extra',
        rpe: entry.rpe, minutes: entry.minutes, skipped: false, injured: false
      });
    });
    sessions.sort((a, b) => a.date.localeCompare(b.date));

    const charts = buildChartsHtml(sessions);
    const rd = computeReadiness(uid);
    const readinessHtml = buildReadinessCard(rd);

    // Player profile header (same as player overview)
    const picHtml = u.profilePic
      ? `<img src="${u.profilePic}" alt="Profile" class="player-overview-pic">`
      : `<div class="player-overview-pic player-overview-pic-placeholder">${sanitize(u.name).charAt(0).toUpperCase()}</div>`;
    const team = u.team || '';
    const teamBadge = team
      ? `<span class="po-team-badge">${sanitize(team)}</span>`
      : '';
    const positions = (u.position || '').split(',').map(s => s.trim()).filter(Boolean);
    const layoutCls = positions.length === 3 ? 'po-pos-tri' : positions.length === 2 ? 'po-pos-duo' : 'po-pos-one';
    const posCircles = positions.map(p => {
      const bg = POS_COLORS[p] || '#9e9e9e';
      return `<span class="po-pos-circle" style="background:${bg}">${sanitize(p)}</span>`;
    }).join('');
    const number = u.playerNumber || '—';
    const dob = u.dob || '';
    let ageLabel = '';
    if (dob) {
      const bd = new Date(dob + 'T12:00:00');
      const today = new Date();
      let age = today.getFullYear() - bd.getFullYear();
      if (today.getMonth() < bd.getMonth() || (today.getMonth() === bd.getMonth() && today.getDate() < bd.getDate())) age--;
      ageLabel = ` <span style="color:var(--text-secondary);font-weight:400;font-size:.85em;">(${age} anys)</span>`;
    }

    return `
      <button class="btn btn-outline btn-small detail-back" data-back="${backTarget('manage-roster')}">${t('btn.back')}</button>
      <h2 class="page-title">${sanitize(u.name)} <span style="color:var(--text-secondary);font-weight:600;">#${sanitize(String(number))}</span>${ageLabel}</h2>
      <div class="player-overview-card">
        <div class="player-overview-left">
          <div class="po-pic-wrap">
            ${picHtml}
            ${teamBadge}
          </div>
          <div class="po-pos-wrap ${layoutCls}">${posCircles}</div>
        </div>
      </div>
      <div class="card mystats-summary" style="margin-top:.75rem;">
        <div class="mystats-nums">
          <div class="mystats-num"><span class="mystats-num-val">${ct.goals}</span><span class="mystats-num-lbl">Goals</span></div>
          <div class="mystats-num"><span class="mystats-num-val">${ct.assists}</span><span class="mystats-num-lbl">Assists</span></div>
          <div class="mystats-num"><span class="mystats-num-val">${ct.matches}</span><span class="mystats-num-lbl">Matches</span></div>
          <div class="mystats-num"><span class="mystats-num-val">${ct.titulars}</span><span class="mystats-num-lbl">Titular</span></div>
          <div class="mystats-num"><span class="mystats-num-val">${ct.minutes}</span><span class="mystats-num-lbl">Minutes</span></div>
        </div>
      </div>
      ${matchTableHtml}
      ${buildInjuryHistoryHtml(uid)}
      ${readinessHtml}
      ${charts.acwr}
      ${charts.rpe}
      ${charts.uaWeek}`;
  }

  // lightenHex, darkenHex, hexToRgba, textColorFor → utils.js

  // One-time cleanup: remove match-linked boards that no longer exist in saved boards
  if (!localStorage.getItem('fa_cleanup_orphan_match_boards')) {
    const saved = JSON.parse(localStorage.getItem('fa_tactic_saved') || '[]');
    const savedNames = new Set(saved.map(b => b.name));
    const mb = JSON.parse(localStorage.getItem('fa_tactic_match_boards') || '{}');
    let changed = false;
    for (const mid of Object.keys(mb)) {
      const before = mb[mid].length;
      mb[mid] = mb[mid].filter(b => savedNames.has(b.name));
      if (mb[mid].length !== before) changed = true;
      if (!mb[mid].length) { delete mb[mid]; changed = true; }
    }
    if (changed) localStorage.setItem('fa_tactic_match_boards', JSON.stringify(mb));
    // Also clean training-linked boards
    const tb = JSON.parse(localStorage.getItem('fa_tactic_training_boards') || '{}');
    let tbChanged = false;
    for (const tdate of Object.keys(tb)) {
      const before = tb[tdate].length;
      tb[tdate] = tb[tdate].filter(b => savedNames.has(b.name));
      if (tb[tdate].length !== before) tbChanged = true;
      if (!tb[tdate].length) { delete tb[tdate]; tbChanged = true; }
    }
    if (tbChanged) localStorage.setItem('fa_tactic_training_boards', JSON.stringify(tb));
    localStorage.setItem('fa_cleanup_orphan_match_boards', '1');
  }

  function renderTactics() {
    const formations = TACTIC_FORMATIONS;

    const boardType = localStorage.getItem('fa_tactic_board_type') || '';

    // If no board type chosen, show picker
    if (!boardType) {
      // Saved boards list (show even on picker screen)
      const savedListHtml = tbSavedListHtml(getSavedBoards(),
        localStorage.getItem('fa_tactic_loaded_id'));
      return `
        <h2 class="page-title">${t('page.tactical_board')}</h2>
        <div class="card">
          <div class="tb-type-picker" id="tb-type-picker">
            <div class="tb-type-card" data-board-type="full">
              <div class="tb-type-preview">
                <div class="tbp-halfway"></div>
                <div class="tbp-center-circle"></div>
                <div class="tbp-penalty-l"></div>
                <div class="tbp-penalty-r"></div>
                <div class="tbp-goal-l"></div>
                <div class="tbp-goal-r"></div>
              </div>
            </div>
            <div class="tb-type-card" data-board-type="half">
              <div class="tb-type-preview half">
                <div class="tbp-half-line"></div>
                <div class="tbp-half-circle"></div>
                <div class="tbp-half-penalty"></div>
                <div class="tbp-half-goal"></div>
                <div class="tbp-half-arc"></div>
              </div>
            </div>
            <div class="tb-type-card" data-board-type="area">
              <div class="tb-type-preview area">
                <div class="tbp-area-box"></div>
                <div class="tbp-area-goal"></div>
                <div class="tbp-area-arc"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="tb-saved-title">${t('tactics.saved_boards')}</div>
          <div class="tb-saved-list" id="tb-saved-list">${savedListHtml}</div>
        </div>`;
    }

    const isVertical = localStorage.getItem('fa_tactic_orient') === 'vertical';
    const savedFormation = localStorage.getItem('fa_tactic_formation') || '';
    const savedPositions = JSON.parse(localStorage.getItem('fa_tactic_positions') || 'null');
    const savedNumbers = JSON.parse(localStorage.getItem('fa_tactic_numbers') || 'null');
    const savedColors = JSON.parse(localStorage.getItem('fa_tactic_colors') || 'null');
    const savedName = localStorage.getItem('fa_tactic_name') || '';
    const teamColor = localStorage.getItem('fa_tactic_team_color') || '#ffffff';
    const oppColor = localStorage.getItem('fa_tactic_opp_color') || '#e53935';
    const showOpp = localStorage.getItem('fa_tactic_show_opp') === 'true';
    let savedBalls = JSON.parse(localStorage.getItem('fa_tactic_balls') || 'null');
    if (!savedBalls) { const _bp = JSON.parse(localStorage.getItem('fa_tactic_ball_pos') || 'null'); savedBalls = _bp ? [_bp] : [[50, 50]]; }
    const savedArrows = JSON.parse(localStorage.getItem('fa_tactic_arrows') || '[]');
    const savedRects = JSON.parse(localStorage.getItem('fa_tactic_rects') || '[]');
    const savedTexts = JSON.parse(localStorage.getItem('fa_tactic_texts') || '[]');
    const savedSilhouette = localStorage.getItem('fa_tactic_silhouette') || '';
    const savedCones = JSON.parse(localStorage.getItem('fa_tactic_cones') || '[]');
    const GK_COLOR = '#f5c842';

    let circlesHtml = '';
    if (savedFormation && formations[savedFormation]) {
      let pos;
      if (savedPositions) {
        pos = savedPositions;
      } else if (boardType !== 'full') {
        // Adapt default formation for half/area
        pos = formations[savedFormation].map(([hLeft, hTop]) => {
          let newLeft = hTop;
          let newTop = hLeft;
          if (boardType === 'half') { newTop = Math.min(98, Math.max(2, newTop * 1.3)); }
          else if (boardType === 'area') { newTop = Math.min(98, Math.max(2, newTop * 1.7)); }
          return [Math.min(98, Math.max(2, newLeft)), newTop];
        });
      } else {
        pos = formations[savedFormation];
      }
      const nums = savedNumbers || new Array(11).fill('');
      const clrs = savedColors || [];
      circlesHtml = pos.map((p, i) => {
        if (!p) return ''; // null = deleted circle slot
        let dl = p[0], dt = p[1];
        if (isVertical && boardType === 'full') { dl = p[1]; dt = 100 - p[0]; }
        const num = String(nums[i] || '');
        const isGk = num === '1';
        const bg = isGk ? GK_COLOR : (clrs[i] || teamColor);
        const fg = textColorFor(bg);
        const bc = darkenHex(bg, 50);
        const dc = clrs[i] ? ` data-color="${clrs[i]}"` : '';
        return `<div class="tb-circle" data-idx="${i}"${dc} style="left:${dl}%;top:${dt}%;background:${bg};border-color:${bc};">` +
          `<input class="tb-num" maxlength="2" value="${sanitize(num)}" placeholder="" style="color:${fg};">` +
          `</div>`;
      }).join('');
    }

    let oppCirclesHtml = '';
    if (showOpp && savedFormation && formations[savedFormation]) {
      const savedOppPos = JSON.parse(localStorage.getItem('fa_tactic_opp_positions') || 'null');
      const savedOppNums = JSON.parse(localStorage.getItem('fa_tactic_opp_numbers') || 'null');
      let oppPos;
      if (savedOppPos) {
        oppPos = savedOppPos;
      } else {
        const mirrored = formations[savedFormation].map(([l,t]) => [100 - l, t]);
        if (boardType !== 'full') {
          oppPos = mirrored.map(([hLeft, hTop]) => {
            let newLeft = hTop;
            let newTop = hLeft;
            if (boardType === 'half') { newTop = Math.min(98, Math.max(2, newTop * 1.3)); }
            else if (boardType === 'area') { newTop = Math.min(98, Math.max(2, newTop * 1.7)); }
            return [Math.min(98, Math.max(2, newLeft)), newTop];
          });
        } else {
          oppPos = mirrored;
        }
      }
      const oppNums = savedOppNums || new Array(11).fill('');
      oppCirclesHtml = oppPos.map((p, i) => {
        if (!p) return ''; // null = deleted circle slot
        let dl = p[0], dt = p[1];
        if (isVertical && boardType === 'full') { dl = p[1]; dt = 100 - p[0]; }
        const num = String(oppNums[i] || '');
        const isGk = num === '1';
        const bg = isGk ? GK_COLOR : oppColor;
        const fg = textColorFor(bg);
        const bc = darkenHex(bg, 50);
        return `<div class="tb-circle tb-circle-opp" data-idx="${i}" style="left:${dl}%;top:${dt}%;background:${bg};border-color:${bc};">` +
          `<input class="tb-num" maxlength="2" value="${sanitize(String(oppNums[i] || ''))}" placeholder="" style="color:${fg};">` +
          `</div>`;
      }).join('');
    }

    // Saved boards list
    const savedListHtml = tbSavedListHtml(getSavedBoards(),
      localStorage.getItem('fa_tactic_loaded_id'));

    let fieldCls = 'tb-field';
    if (isVertical) fieldCls += ' tb-vertical';
    if (boardType === 'half') fieldCls += ' tb-half';
    else if (boardType === 'area') fieldCls += ' tb-area';

    return `
      <h2 class="page-title">${t('page.tactical_board')}</h2>
      <div class="card">
        <div class="tb-controls">
          <label class="tb-label">${t('tactics.formation')}</label>
          <div class="tb-formation-wrap" id="tb-formation-wrap">
            <div class="tb-formation-toggle" id="tb-formation-toggle">${savedFormation || '— Select —'}</div>
            <div class="tb-formation-list" id="tb-formation-list">
              <div class="tb-formation-option" data-val="">— Select —</div>
              ${Object.keys(formations).map(f => `<div class="tb-formation-option${f === savedFormation ? ' active' : ''}" data-val="${f}">${f}</div>`).join('')}
            </div>
          </div>
          <button class="tb-orient-btn" id="tb-orient" data-tooltip="Toggle orientation"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>
          <input type="color" class="tb-color-pick" id="tb-team-color" value="${teamColor}" data-tooltip="Team color">
          <label class="tb-opp-toggle"><input type="checkbox" id="tb-show-opp" ${showOpp ? 'checked' : ''}> Opp</label>
          <input type="color" class="tb-color-pick" id="tb-opp-color" value="${oppColor}" data-tooltip="Opponent color" ${showOpp ? '' : 'style="display:none"'}>
          <span class="tb-sep"></span>
          <button class="tb-arrow-tool" id="tb-arrow-tool" data-tooltip="Draw arrow"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>
          <input type="color" class="tb-color-pick tb-arrow-color-pick" id="tb-arrow-color" value="${localStorage.getItem('fa_tactic_arrow_color') || '#ffffff'}" data-tooltip="Arrow color">
          <label class="tb-opp-toggle tb-arrow-dash-label"><input type="checkbox" id="tb-arrow-dash" ${localStorage.getItem('fa_tactic_arrow_dash') === 'true' ? 'checked' : ''}> Dash</label>
          <span class="tb-sep"></span>
          <button class="tb-rect-tool" id="tb-rect-tool" data-tooltip="Draw rectangle"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/></svg></button>
          <input type="color" class="tb-color-pick" id="tb-rect-color" value="${localStorage.getItem('fa_tactic_rect_color') || '#ffffff'}" data-tooltip="Rectangle color">
          <input type="range" class="tb-opacity-range" id="tb-rect-opacity" min="0" max="100" value="${localStorage.getItem('fa_tactic_rect_opacity') || '30'}" data-tooltip="Fill opacity">
          <span class="tb-sep"></span>
          <button class="tb-text-tool" id="tb-text-tool" data-tooltip="Add text label">T</button>
          <input type="color" class="tb-color-pick" id="tb-text-color" value="${localStorage.getItem('fa_tactic_text_color') || '#000000'}" data-tooltip="Text background color">
          <input type="range" class="tb-opacity-range" id="tb-text-opacity" min="0" max="100" value="${localStorage.getItem('fa_tactic_text_opacity') || '80'}" data-tooltip="Background opacity">
          <span class="tb-size-label tb-size-label-sm">A</span><input type="range" class="tb-size-range" id="tb-text-size" min="8" max="28" value="${localStorage.getItem('fa_tactic_text_size') || '12'}" data-tooltip="Font size"><span class="tb-size-label tb-size-label-lg">A</span>
          <span class="tb-sep"></span>
          <button class="tb-pen-tool" id="tb-pen-tool" data-tooltip="Freehand pen"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg></button>
          <input type="color" class="tb-color-pick" id="tb-pen-color" value="${localStorage.getItem('fa_tactic_pen_color') || '#ffffff'}" data-tooltip="Pen color">
          <label class="tb-opp-toggle tb-arrow-dash-label"><input type="checkbox" id="tb-pen-dash" ${localStorage.getItem('fa_tactic_pen_dash') === 'true' ? 'checked' : ''}> Dash</label>
          <span class="tb-sep"></span>
          <div class="tb-sil-wrap" id="tb-sil-wrap">
            <button class="tb-sil-btn" id="tb-sil-btn" data-tooltip="Silhouette">
              <img src="img/sil-one-arm-up.png" alt="" style="width:22px;height:22px;object-fit:contain;display:block;margin:auto;">
            </button>
            <div class="tb-sil-menu" id="tb-sil-menu">
              <div class="tb-sil-opt${savedSilhouette === '' ? ' tb-sil-active' : ''}" data-sil="">None</div>
              <div class="tb-sil-opt${savedSilhouette === 'both-arms-up' ? ' tb-sil-active' : ''}" data-sil="both-arms-up"><img src="img/sil-both-arms-up.png" alt="">Both arms up</div>
              <div class="tb-sil-opt${savedSilhouette === 'one-arm-up' ? ' tb-sil-active' : ''}" data-sil="one-arm-up"><img src="img/sil-one-arm-up.png" alt="">One arm up</div>
              <div class="tb-sil-opt${savedSilhouette === 'arms-crossed' ? ' tb-sil-active' : ''}" data-sil="arms-crossed"><img src="img/sil-arms-crossed.png" alt="">Arms crossed</div>
              <div class="tb-sil-opt${savedSilhouette === 'arms-side' ? ' tb-sil-active' : ''}" data-sil="arms-side"><img src="img/sil-arms-side.png" alt="">Arms to side</div>
            </div>
          </div>
          <span class="tb-sep"></span>
          <button class="tb-cone-tool" id="tb-cone-tool" data-tooltip="Place cone"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polygon points="12,2 4,22 20,22" fill="#ff8c00" stroke="#cc7000" stroke-width="1.5" stroke-linejoin="round"/></svg></button>
          <button class="tb-ball-tool" id="tb-ball-tool" data-tooltip="Add ball"><span class="tb-ball-icon">⚽</span></button>
          <span class="tb-sep"></span>
          <button class="tb-select-tool" id="tb-select-tool" data-tooltip="Select mode (tap to select)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l14 9-7 2-4 7-3-18z"/></svg></button>
        </div>
        <div class="tb-btn-row">
          <button class="btn btn-small btn-tb-new" id="tb-new-board">New Board</button>
        </div>
        <input class="tb-board-name" id="tb-board-name" placeholder="Board name…" value="${sanitize(savedName)}">
        <div class="${fieldCls}" id="tb-field">
          <div class="tb-field-inner">
            <div class="tb-halfway"></div>
            <div class="tb-center-circle"></div>
            <div class="tb-center-spot"></div>
            <div class="tb-penalty-left"></div>
            <div class="tb-penalty-right"></div>
            <div class="tb-goal-left"></div>
            <div class="tb-goal-right"></div>
            <div class="tb-penalty-arc-left"></div>
            <div class="tb-penalty-arc-right"></div>
            <div class="tb-penalty-spot-left"></div>
            <div class="tb-penalty-spot-right"></div>
            ${circlesHtml}
            ${oppCirclesHtml}
            ${savedBalls.map((bp,bi) => { if(!bp) return ''; let bx=bp[0],by=bp[1]; if(isVertical&&boardType==='full'){bx=bp[1];by=100-bp[0];} return '<div class="tb-ball" data-idx="'+bi+'" style="left:'+bx+'%;top:'+by+'%;">' + '</div>'; }).join('')}
            ${savedCones.map((c,i) => {
              let cx=c[0], cy=c[1];
              if (isVertical && boardType === 'full') { cx=c[1]; cy=100-c[0]; }
              return '<div class="tb-cone" data-idx="'+i+'" style="left:'+cx+'%;top:'+cy+'%;"></div>';
            }).join('')}
            <img class="tb-silhouette" id="tb-silhouette" src="${savedSilhouette ? 'img/sil-' + savedSilhouette + '.png' : ''}" alt="" style="display:${savedSilhouette ? 'block' : 'none'};">
            <svg class="tb-arrows-svg" id="tb-arrows-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs id="tb-arrow-defs"></defs>
              ${savedRects.map((r,i) => {
                let rx=r[0],ry=r[1],rw=r[2],rh=r[3];
                const rColor = r[4] || '#ffffff';
                const rOp = r[5] != null ? r[5] : 0.3;
                if (isVertical && boardType === 'full') { rx=r[1]; ry=100-r[0]-r[2]; const tmp=rw; rw=rh; rh=tmp; }
                return '<rect class="tb-rect" data-idx="'+i+'" x="'+rx+'%" y="'+ry+'%" width="'+rw+'%" height="'+rh+'%" data-color="'+rColor+'" data-opacity="'+rOp+'" style="fill:'+rColor+';fill-opacity:'+rOp+';stroke:'+rColor+';" />';
              }).join('')}
              ${savedArrows.map((a,i) => {
                let x1=a[0],y1=a[1],x2=a[2],y2=a[3];
                const aColor = a[4] || '#ffffff';
                const aDash = a[5] ? ' stroke-dasharray="6 4"' : '';
                if (isVertical && boardType === 'full') { x1=a[1]; y1=100-a[0]; x2=a[3]; y2=100-a[2]; }
                return '<line class="tb-arrow" data-idx="'+i+'" data-color="'+aColor+'" data-dash="'+(a[5]?'1':'')+'" x1="'+x1+'%" y1="'+y1+'%" x2="'+x2+'%" y2="'+y2+'%" style="stroke:'+aColor+';"'+aDash+' />';
              }).join('')}
            </svg>
            ${savedTexts.map((t,i) => {
              let tx=t[0], ty=t[1];
              if (isVertical && boardType === 'full') { tx=t[1]; ty=100-t[0]; }
              const tColor = t[3] || '#000000';
              const tOp = t[4] != null ? t[4] : 0.8;
              const fg = textColorFor(tColor);
              const tW = t[5] ? 'width:'+t[5]+'px;' : '';
              const tH = t[6] ? 'height:'+t[6]+'px;' : '';
              const tFs = t[7] ? 'font-size:'+t[7]+'px;' : '';
              return '<div class="tb-text-label" data-idx="'+i+'" data-color="'+tColor+'" data-opacity="'+tOp+'" style="left:'+tx+'%;top:'+ty+'%;background:rgba('+parseInt(tColor.slice(1,3),16)+','+parseInt(tColor.slice(3,5),16)+','+parseInt(tColor.slice(5,7),16)+','+tOp+');color:'+fg+';'+tW+tH+tFs+'">'+sanitize(t[2])+'</div>';
            }).join('')}
          </div>
        </div>
        <div class="tb-frames-section">
          <div class="tb-frames-header">
            <span class="tb-frames-title">Frames</span>
            <button class="btn btn-small tb-frame-play" id="tb-frame-play" title="Play animation"></button>
          </div>
          <div class="tb-frames-strip" id="tb-frames-strip">
            <button class="tb-frame-add" id="tb-frame-add" title="Add frame">+</button>
          </div>
        </div>
        <div class="tb-tag-section">
          <div class="tb-tag-label">Tag</div>
          <div class="tb-tag-select-wrap" id="tb-tag-select-wrap">
            <div class="tb-tag-toggle${localStorage.getItem('fa_tactic_tag') ? ' has-tag' : ''}" id="tb-tag-toggle">${sanitize(localStorage.getItem('fa_tactic_tag') || '') || '— None —'}</div>
            <div class="tb-tag-list" id="tb-tag-list"></div>
          </div>
          <div class="tb-tag-add-row">
            <input class="tb-tag-add-input" id="tb-tag-add-input" type="text" placeholder="New tag...">
            <button class="btn btn-small btn-orange" id="tb-tag-add-btn">Add</button>
          </div>
        </div>
        <div class="tb-match-section">
          <div class="tb-match-label">Add to Match</div>
          <div class="tb-match-row">
            <div class="tb-match-wrap" id="tb-match-wrap">
              <div class="tb-match-toggle" id="tb-match-toggle">None</div>
              <div class="tb-match-list" id="tb-match-list">
                <div class="tb-match-option" data-val="">None</div>
                ${(() => {
                  const allMatches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
                  const now = new Date();
                  return allMatches.filter(m => {
                    if (!m.date || !m.time) return true;
                    return new Date(m.date + 'T' + m.time + ':00') > now;
                  }).map(m => {
                    const teamLetter = m.team ? ' (' + sanitize(m.team) + ')' : '';
                    const home = isOurTeam(m.home) ? getClubName() + teamLetter : sanitize(m.home);
                    const away = isOurTeam(m.away) ? getClubName() + teamLetter : sanitize(m.away);
                    const d = m.date ? tDateDayMonth(m.date) : '';
                    return '<div class="tb-match-option" data-val="' + m.id + '">' + home + ' vs ' + away + (d ? '<span style="font-weight:400;"> — ' + d + '</span>' : '') + '</div>';
                  }).join('');
                })()}
              </div>
            </div>
            <button class="btn btn-small btn-orange" id="tb-add-to-match">Add</button>
          </div>
          <div class="tb-match-linked" id="tb-match-linked"></div>
        </div>
        <div class="tb-match-section">
          <div class="tb-match-label">Add to Training</div>
          <div class="tb-match-row">
            <div class="tb-match-wrap" id="tb-training-wrap">
              <div class="tb-match-toggle" id="tb-training-toggle">None</div>
              <div class="tb-match-list" id="tb-training-list">
                <div class="tb-match-option" data-val="">None</div>
                ${(() => {
                  const allTraining = getTrainings();
                  const todayStr = new Date().toISOString().slice(0, 10);
                  return allTraining.filter(t => t.date && t.date >= todayStr).map(t => {
                    const d = tDateShort(t.date);
                    return '<div class="tb-match-option" data-val="' + sanitize(t.date) + '">' + sanitize(t.focus || 'Training') + '<span style="font-weight:400;"> — ' + d + '</span></div>';
                  }).join('');
                })()}
              </div>
            </div>
            <button class="btn btn-small btn-orange" id="tb-add-to-training">Add</button>
          </div>
          <div class="tb-match-linked" id="tb-training-linked"></div>
        </div>
        <div class="tb-btn-row">
          <button class="btn btn-small btn-primary" id="tb-save">Save</button>
          <button class="btn btn-small btn-tb-saveas" id="tb-save-as">Save As</button>
        </div>
        <div class="tb-saved-title">${t('tactics.saved_boards')}</div>
        <div class="tb-saved-list" id="tb-saved-list">${savedListHtml}</div>
      </div>`;
  }

  // #endregion Readiness Engine & Charts

  // #region Tactical Board Editor
  // ---------- Tactical Board bindings ----------
  function bindTactics() {
    const GK_COLOR = '#f5c842';
    // Board type picker
    const picker = document.getElementById('tb-type-picker');
    if (picker) {
      picker.querySelectorAll('.tb-type-card').forEach(card => {
        card.addEventListener('click', () => {
          localStorage.setItem('fa_tactic_board_type', card.dataset.boardType);
          navigate('tactics');
        });
      });
      // Still bind saved list on picker screen
      bindTacticsSavedList();
      return;
    }

    const field = document.getElementById('tb-field');
    if (!field) return;
    const inner = field.querySelector('.tb-field-inner');
    const nameInput = document.getElementById('tb-board-name');

    const formations = TACTIC_FORMATIONS;

    const isVertical = () => localStorage.getItem('fa_tactic_orient') === 'vertical';
    const useJsSwap = () => isVertical() && (localStorage.getItem('fa_tactic_board_type') || 'full') === 'full';
    const curBoardType = () => localStorage.getItem('fa_tactic_board_type') || 'full';

    // Remap default formation positions for half/area board types
    // Formations are authored for horizontal full field: [left%, top%]
    // Half field: goal at top, halfway at bottom. Remap left→top (attacking direction), top→left (sideline)
    // Area: same as half but more zoomed in
    function adaptFormation(posArr) {
      const bt = curBoardType();
      if (bt === 'full') return posArr;
      // For half/area: swap axes — horizontal left% becomes top%, horizontal top% becomes left%
      // Then scale top to fill the visible area
      return posArr.map(([hLeft, hTop]) => {
        // hLeft: 0=GK side, 100=attack → map to top: 100=bottom(halfway), 0=top(goal)
        // hTop: 0=top sideline, 100=bottom sideline → map to left: 0=left, 100=right
        let newLeft = hTop;
        let newTop = hLeft;
        // Scale to use more of the visible field
        if (bt === 'half') {
          newTop = newTop * 1.3;  // stretch to fill 77% height field
          newTop = Math.min(98, Math.max(2, newTop));
        } else if (bt === 'area') {
          newTop = newTop * 1.7;  // stretch to fill 58% height field
          newTop = Math.min(98, Math.max(2, newTop));
        }
        newLeft = Math.min(98, Math.max(2, newLeft));
        return [newLeft, newTop];
      });
    }

    function toDisplay(hLeft, hTop) {
      if (useJsSwap()) return [hTop, 100 - hLeft];
      return [hLeft, hTop];
    }
    function toHorizontal(dLeft, dTop) {
      if (useJsSwap()) return [100 - dTop, dLeft];
      return [dLeft, dTop];
    }

    function saveState() {
      const tc = document.getElementById('tb-team-color')?.value || '#ffffff';
      const oc = document.getElementById('tb-opp-color')?.value || '#e53935';
      const circles = inner.querySelectorAll('.tb-circle:not(.tb-circle-opp)');
      // Use dataset.idx as the stable array index; fill gaps with null
      // Preserve existing numbers for deleted slots so they aren't lost
      const existingNums = JSON.parse(localStorage.getItem('fa_tactic_numbers') || '[]');
      const existingOppNums = JSON.parse(localStorage.getItem('fa_tactic_opp_numbers') || '[]');
      const existingColors = JSON.parse(localStorage.getItem('fa_tactic_colors') || '[]');
      let maxIdx = -1;
      circles.forEach(c => { const idx = Number(c.dataset.idx); if (idx > maxIdx) maxIdx = idx; });
      maxIdx = Math.max(maxIdx, existingNums.length - 1);
      const pos = new Array(maxIdx + 1).fill(null);
      const nums = new Array(maxIdx + 1).fill('');
      const colors = new Array(maxIdx + 1).fill('');
      // Carry forward numbers and colors for deleted slots
      for (let i = 0; i < existingNums.length; i++) {
        if (existingNums[i]) nums[i] = existingNums[i];
      }
      for (let i = 0; i < existingColors.length; i++) {
        if (existingColors[i]) colors[i] = existingColors[i];
      }
      circles.forEach(c => {
        const idx = Number(c.dataset.idx);
        const dL = parseFloat(c.style.left);
        const dT = parseFloat(c.style.top);
        const h = toHorizontal(dL, dT);
        pos[idx] = [Math.round(h[0]*100)/100, Math.round(h[1]*100)/100];
        const inp = c.querySelector('.tb-num');
        const num = inp.value;
        nums[idx] = num;
        colors[idx] = c.dataset.color || '';
        // GK recolor: number "1" gets gold
        const isGk = num.trim() === '1';
        if (isGk) {
          c.style.background = GK_COLOR; c.style.borderColor = darkenHex(GK_COLOR, 50);
          inp.style.color = textColorFor(GK_COLOR);
        } else if (!c.dataset.color) {
          c.style.background = tc; c.style.borderColor = darkenHex(tc, 50);
          inp.style.color = textColorFor(tc);
        }
      });
      localStorage.setItem('fa_tactic_positions', JSON.stringify(pos));
      localStorage.setItem('fa_tactic_numbers', JSON.stringify(nums));
      localStorage.setItem('fa_tactic_colors', JSON.stringify(colors));
      const oppCircles = inner.querySelectorAll('.tb-circle-opp');
      let maxOppIdx = -1;
      oppCircles.forEach(c => { const idx = Number(c.dataset.idx); if (idx > maxOppIdx) maxOppIdx = idx; });
      maxOppIdx = Math.max(maxOppIdx, existingOppNums.length - 1);
      if (oppCircles.length) {
        const oppPos = new Array(maxOppIdx + 1).fill(null);
        const oppNums = new Array(maxOppIdx + 1).fill('');
        // Carry forward numbers for deleted opp slots
        for (let i = 0; i < existingOppNums.length; i++) {
          if (existingOppNums[i]) oppNums[i] = existingOppNums[i];
        }
        oppCircles.forEach(c => {
          const idx = Number(c.dataset.idx);
          const dL = parseFloat(c.style.left);
          const dT = parseFloat(c.style.top);
          const h = toHorizontal(dL, dT);
          oppPos[idx] = [Math.round(h[0]*100)/100, Math.round(h[1]*100)/100];
          const inp = c.querySelector('.tb-num');
          const num = inp.value;
          oppNums[idx] = num;
          // GK recolor for opp
          if (num.trim() === '1') {
            c.style.background = GK_COLOR; c.style.borderColor = darkenHex(GK_COLOR, 50);
            inp.style.color = textColorFor(GK_COLOR);
          } else {
            c.style.background = oc; c.style.borderColor = darkenHex(oc, 50);
            inp.style.color = textColorFor(oc);
          }
        });
        localStorage.setItem('fa_tactic_opp_positions', JSON.stringify(oppPos));
        localStorage.setItem('fa_tactic_opp_numbers', JSON.stringify(oppNums));
      }
      if (nameInput) localStorage.setItem('fa_tactic_name', nameInput.value);
      // Save ball positions
      saveBalls();
    }

    function spawnCircles(posArr, nums) {
      inner.querySelectorAll('.tb-circle:not(.tb-circle-opp)').forEach(c => c.remove());
      const tc = '#ffffff';
      posArr.forEach((p, i) => {
        if (!p) return; // null = deleted circle slot
        const d = toDisplay(p[0], p[1]);
        const num = (nums && nums[i]) || '';
        const isGk = String(num) === '1';
        const bg = isGk ? GK_COLOR : tc;
        const bc = darkenHex(bg, 50);
        const div = document.createElement('div');
        div.className = 'tb-circle';
        div.dataset.idx = i;
        div.style.left = d[0] + '%';
        div.style.top = d[1] + '%';
        div.style.background = bg;
        div.style.borderColor = bc;
        const inp = document.createElement('input');
        inp.className = 'tb-num';
        inp.maxLength = 2;
        inp.value = num;
        inp.style.color = textColorFor(bg);
        inp.addEventListener('input', () => { saveState(); syncNumbersAcrossFrames(); });
        div.appendChild(inp);
        makeDraggable(div);
        inner.appendChild(div);
      });
      saveState();
    }

    function spawnOppCircles() {
      inner.querySelectorAll('.tb-circle-opp').forEach(c => c.remove());
      const f = localStorage.getItem('fa_tactic_formation');
      if (!f || !formations[f]) return;
      const mirrored = formations[f].map(([l,t]) => [100 - l, t]);
      const adapted = adaptFormation(mirrored);
      const oc = document.getElementById('tb-opp-color')?.value || '#e53935';
      const obc = darkenHex(oc, 50);
      adapted.forEach((p, i) => {
        const d = toDisplay(p[0], p[1]);
        const div = document.createElement('div');
        div.className = 'tb-circle tb-circle-opp';
        div.dataset.idx = i;
        div.style.left = d[0] + '%';
        div.style.top = d[1] + '%';
        div.style.background = oc;
        div.style.borderColor = obc;
        const inp = document.createElement('input');
        inp.className = 'tb-num';
        inp.maxLength = 2;
        inp.style.color = textColorFor(oc);
        inp.addEventListener('input', () => { saveState(); syncNumbersAcrossFrames(); });
        div.appendChild(inp);
        makeDraggable(div);
        inner.appendChild(div);
      });
      saveState();
    }

    function updateCircleColors() {
      const tc = document.getElementById('tb-team-color')?.value || '#ffffff';
      const oc = document.getElementById('tb-opp-color')?.value || '#e53935';
      localStorage.setItem('fa_tactic_team_color', tc);
      localStorage.setItem('fa_tactic_opp_color', oc);
      inner.querySelectorAll('.tb-circle:not(.tb-circle-opp)').forEach(c => {
        const num = c.querySelector('.tb-num')?.value || '';
        if (num === '1') return;
        if (c.dataset.color) return;
        c.style.background = tc; c.style.borderColor = darkenHex(tc, 50);
        c.querySelector('.tb-num').style.color = textColorFor(tc);
      });
      inner.querySelectorAll('.tb-circle-opp').forEach(c => {
        const num = c.querySelector('.tb-num')?.value || '';
        if (num === '1') return;
        c.style.background = oc; c.style.borderColor = darkenHex(oc, 50);
        c.querySelector('.tb-num').style.color = textColorFor(oc);
      });
    }

    // --- Undo stack ---
    const undoStack = [];
    function pushUndo() {
      undoStack.push({
        positions: localStorage.getItem('fa_tactic_positions'),
        numbers: localStorage.getItem('fa_tactic_numbers'),
        colors: localStorage.getItem('fa_tactic_colors'),
        oppPositions: localStorage.getItem('fa_tactic_opp_positions'),
        oppNumbers: localStorage.getItem('fa_tactic_opp_numbers'),
        balls: localStorage.getItem('fa_tactic_balls'),
        arrows: localStorage.getItem('fa_tactic_arrows'),
        rects: localStorage.getItem('fa_tactic_rects'),
        texts: localStorage.getItem('fa_tactic_texts'),
        penLines: localStorage.getItem('fa_tactic_pen_lines'),
        silhouette: localStorage.getItem('fa_tactic_silhouette'),
        cones: localStorage.getItem('fa_tactic_cones')
      });
      if (undoStack.length > 50) undoStack.shift();
    }
    function popUndo() {
      if (!undoStack.length) return;
      const s = undoStack.pop();
      const keys = ['positions','numbers','colors','oppPositions','oppNumbers','balls','arrows','rects','texts','penLines','silhouette','cones'];
      const lsKeys = ['fa_tactic_positions','fa_tactic_numbers','fa_tactic_colors',
        'fa_tactic_opp_positions','fa_tactic_opp_numbers','fa_tactic_balls',
        'fa_tactic_arrows','fa_tactic_rects','fa_tactic_texts',
        'fa_tactic_pen_lines','fa_tactic_silhouette','fa_tactic_cones'];
      keys.forEach((k, i) => {
        if (s[k] !== null) localStorage.setItem(lsKeys[i], s[k]);
        else localStorage.removeItem(lsKeys[i]);
      });
      // Rebuild DOM from restored state
      const f = {
        positions: JSON.parse(s.positions || 'null'),
        numbers: JSON.parse(s.numbers || 'null'),
        colors: JSON.parse(s.colors || 'null'),
        oppPositions: JSON.parse(s.oppPositions || 'null'),
        oppNumbers: JSON.parse(s.oppNumbers || 'null'),
        balls: JSON.parse(s.balls || '[]'),
        arrows: JSON.parse(s.arrows || '[]'),
        rects: JSON.parse(s.rects || '[]'),
        texts: JSON.parse(s.texts || '[]'),
        penLines: JSON.parse(s.penLines || '[]'),
        silhouette: s.silhouette || '',
        cones: JSON.parse(s.cones || '[]')
      };
      applyFrameState(f);
      refreshArrowheads(arrowsSvg);
      if (activeFrameIdx >= 0) autoSaveFrame();
    }

    // --- Multi-select state ---
    const selected = new Set();
    function clearSelection() {
      selected.forEach(el => el.classList.remove('tb-selected'));
      selected.clear();
    }
    function toggleSelect(el) {
      if (selected.has(el)) {
        selected.delete(el);
        el.classList.remove('tb-selected');
      } else {
        selected.add(el);
        el.classList.add('tb-selected');
      }
    }

    // Helpers to read/write display positions for any element type
    function getElPos(el) {
      if (el.classList.contains('tb-circle') || el.classList.contains('tb-ball')) {
        return { left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
      }
      if (el.classList.contains('tb-arrow')) {
        return { x1: parseFloat(el.getAttribute('x1')), y1: parseFloat(el.getAttribute('y1')),
                 x2: parseFloat(el.getAttribute('x2')), y2: parseFloat(el.getAttribute('y2')) };
      }
      if (el.classList.contains('tb-rect')) {
        return { x: parseFloat(el.getAttribute('x')), y: parseFloat(el.getAttribute('y')),
                 w: parseFloat(el.getAttribute('width')), h: parseFloat(el.getAttribute('height')) };
      }
      if (el.classList.contains('tb-pen-line')) {
        return { pts: el.getAttribute('points') || '' };
      }
      return {};
    }
    function moveEl(el, start, dx, dy) {
      if (el.classList.contains('tb-circle') || el.classList.contains('tb-ball')) {
        el.style.left = Math.max(0, Math.min(100, start.left + dx)) + '%';
        el.style.top = Math.max(0, Math.min(100, start.top + dy)) + '%';
      } else if (el.classList.contains('tb-arrow')) {
        el.setAttribute('x1', (start.x1 + dx) + '%');
        el.setAttribute('y1', (start.y1 + dy) + '%');
        el.setAttribute('x2', (start.x2 + dx) + '%');
        el.setAttribute('y2', (start.y2 + dy) + '%');
      } else if (el.classList.contains('tb-rect')) {
        el.setAttribute('x', (start.x + dx) + '%');
        el.setAttribute('y', (start.y + dy) + '%');
      } else if (el.classList.contains('tb-pen-line')) {
        const shifted = start.pts.split(/\s+/).map(pair => {
          const [x, y] = pair.split(',').map(Number);
          return (x + dx) + ',' + (y + dy);
        }).join(' ');
        el.setAttribute('points', shifted);
      }
    }
    function computeDelta(e, startClientX, startClientY) {
      const rect = inner.getBoundingClientRect();
      const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
      const vert = field.classList.contains('tb-vertical');
      let dx, dy;
      if (isCssRotated && vert) {
        dx = -((e.clientY - startClientY) / rect.height) * 100;
        dy = ((e.clientX - startClientX) / rect.width) * 100;
      } else {
        dx = ((e.clientX - startClientX) / rect.width) * 100;
        dy = ((e.clientY - startClientY) / rect.height) * 100;
      }
      return { dx, dy };
    }
    function buildGroupStarts(excludeEl) {
      const starts = [];
      selected.forEach(el => {
        if (el !== excludeEl) starts.push({ el, pos: getElPos(el) });
      });
      return starts;
    }
    function saveAll() {
      saveState();
      saveArrows();
      saveRects();
      saveTexts();
      savePenLines();
      saveCones();
    }

    // --- Context menu ---
    let ctxMenu = null;
    function closeCtxMenu() {
      if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; }
    }
    document.addEventListener('click', closeCtxMenu);
    document.addEventListener('pointerdown', e => {
      if (ctxMenu && !ctxMenu.contains(e.target)) closeCtxMenu();
    });

    function showCtxMenu(x, y, items) {
      closeCtxMenu();
      ctxMenu = document.createElement('div');
      ctxMenu.className = 'tb-ctx-menu';
      items.forEach(it => {
        if (it.type === 'color') {
          const row = document.createElement('label');
          row.className = 'tb-ctx-item tb-ctx-color-row';
          row.innerHTML = '<span>Color</span>';
          const picker = document.createElement('input');
          picker.type = 'color';
          picker.className = 'tb-ctx-color-pick';
          picker.value = it.value || '#ffffff';
          picker.addEventListener('input', () => { it.action(picker.value); });
          row.appendChild(picker);
          ctxMenu.appendChild(row);
        } else if (it.type === 'range') {
          const row = document.createElement('label');
          row.className = 'tb-ctx-item tb-ctx-color-row';
          row.innerHTML = '<span>' + (it.label || 'Size') + '</span>';
          const slider = document.createElement('input');
          slider.type = 'range';
          slider.min = it.min || 8;
          slider.max = it.max || 28;
          slider.value = it.value || 12;
          slider.style.cssText = 'width:70px;cursor:pointer;';
          slider.addEventListener('input', () => { it.action(Number(slider.value)); });
          row.appendChild(slider);
          ctxMenu.appendChild(row);
        } else {
          const btn = document.createElement('div');
          btn.className = 'tb-ctx-item' + (it.danger ? ' tb-ctx-danger' : '');
          btn.textContent = it.label;
          btn.addEventListener('click', () => { closeCtxMenu(); it.action(); });
          ctxMenu.appendChild(btn);
        }
      });
      // Position
      const mainContent = document.getElementById('main-content') || document.body;
      const mr = mainContent.getBoundingClientRect();
      ctxMenu.style.left = (x - mr.left) + 'px';
      ctxMenu.style.top = (y - mr.top) + 'px';
      mainContent.appendChild(ctxMenu);
      // Keep on screen
      const cr = ctxMenu.getBoundingClientRect();
      if (cr.right > window.innerWidth) ctxMenu.style.left = (parseFloat(ctxMenu.style.left) - (cr.right - window.innerWidth) - 8) + 'px';
      if (cr.bottom > window.innerHeight) ctxMenu.style.top = (parseFloat(ctxMenu.style.top) - (cr.bottom - window.innerHeight) - 8) + 'px';
    }

    function applyColorToCircle(circle, color) {
      circle.dataset.color = color;
      circle.style.background = color;
      circle.style.borderColor = darkenHex(color, 50);
      circle.querySelector('.tb-num').style.color = textColorFor(color);
      saveState();
      syncColorsAcrossFrames();
      autoSaveFrame();
    }

    function addCircleAt(dispLeft, dispTop, isOpp) {
      const tc = isOpp
        ? (document.getElementById('tb-opp-color')?.value || '#e53935')
        : (document.getElementById('tb-team-color')?.value || '#ffffff');
      // Compute next stable idx — must exceed both DOM indices and stored array length
      // so we never reuse a deleted slot's index
      const selector = isOpp ? '.tb-circle-opp' : '.tb-circle:not(.tb-circle-opp)';
      const storageKey = isOpp ? 'fa_tactic_opp_positions' : 'fa_tactic_positions';
      const storedArr = JSON.parse(localStorage.getItem(storageKey) || '[]');
      let maxIdx = storedArr.length - 1;
      inner.querySelectorAll(selector).forEach(c => {
        const idx = Number(c.dataset.idx);
        if (idx > maxIdx) maxIdx = idx;
      });
      const div = document.createElement('div');
      div.className = 'tb-circle' + (isOpp ? ' tb-circle-opp' : '');
      div.dataset.idx = maxIdx + 1;
      div.style.left = dispLeft + '%';
      div.style.top = dispTop + '%';
      div.style.background = tc;
      div.style.borderColor = darkenHex(tc, 50);
      const inp = document.createElement('input');
      inp.className = 'tb-num';
      inp.maxLength = 2;
      inp.style.color = textColorFor(tc);
      inp.addEventListener('input', () => { saveState(); syncNumbersAcrossFrames(); });
      div.appendChild(inp);
      makeDraggable(div);
      inner.appendChild(div);
      pushUndo();
      saveState();
      autoSaveFrame();
      // Add this circle to all future frames at the same position
      const newIdx = maxIdx + 1;
      const h = toHorizontal(dispLeft, dispTop);
      const hPos = [Math.round(h[0]*100)/100, Math.round(h[1]*100)/100];
      const posKey = isOpp ? 'oppPositions' : 'positions';
      for (let fi = activeFrameIdx + 1; fi < frames.length; fi++) {
        if (!frames[fi][posKey]) frames[fi][posKey] = [];
        while (frames[fi][posKey].length <= newIdx) frames[fi][posKey].push(null);
        frames[fi][posKey][newIdx] = hPos;
      }
      saveFrames();
    }

    function deleteCircle(circle) {
      const isOpp = circle.classList.contains('tb-circle-opp');
      const idx = Number(circle.dataset.idx);
      circle.remove();
      selected.delete(circle);
      saveState();
      autoSaveFrame();
      // Remove this circle from all future frames
      for (let fi = activeFrameIdx + 1; fi < frames.length; fi++) {
        const key = isOpp ? 'oppPositions' : 'positions';
        if (frames[fi][key] && idx < frames[fi][key].length) {
          frames[fi][key][idx] = null;
        }
      }
      saveFrames();
    }

    // --- Serialize / Duplicate / Copy-Paste helpers ---
    let selectMode = false;
    const PASTE_OFFSET = 3; // % offset for duplicate/paste

    function serializeElement(el) {
      if (el.classList.contains('tb-ball')) {
        return { type: 'ball', left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
      } else if (el.classList.contains('tb-cone')) {
        return { type: 'cone', left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
      } else if (el.classList.contains('tb-circle') && !el.classList.contains('tb-circle-opp')) {
        return { type: 'circle', left: parseFloat(el.style.left), top: parseFloat(el.style.top),
          num: el.querySelector('.tb-num')?.value || '', color: el.dataset.color || '' };
      } else if (el.classList.contains('tb-circle-opp')) {
        return { type: 'oppCircle', left: parseFloat(el.style.left), top: parseFloat(el.style.top),
          num: el.querySelector('.tb-num')?.value || '', color: '' };
      } else if (el.classList.contains('tb-arrow')) {
        return { type: 'arrow',
          x1: parseFloat(el.dataset.origX1 || el.getAttribute('x1')),
          y1: parseFloat(el.dataset.origY1 || el.getAttribute('y1')),
          x2: parseFloat(el.dataset.origX2 || el.getAttribute('x2')),
          y2: parseFloat(el.dataset.origY2 || el.getAttribute('y2')),
          color: el.dataset.color || '#ffffff', dash: el.dataset.dash === '1' };
      } else if (el.classList.contains('tb-pen-line')) {
        return { type: 'penLine', points: el.getAttribute('points') || '',
          color: el.dataset.color || '#ffffff', dash: el.dataset.dash === '1' };
      } else if (el.classList.contains('tb-rect')) {
        return { type: 'rect', x: parseFloat(el.getAttribute('x')), y: parseFloat(el.getAttribute('y')),
          w: parseFloat(el.getAttribute('width')), h: parseFloat(el.getAttribute('height')),
          color: el.dataset.color || '#ffffff', opacity: parseFloat(el.dataset.opacity) || 0.3 };
      } else if (el.classList.contains('tb-text-label')) {
        return { type: 'text', left: parseFloat(el.style.left), top: parseFloat(el.style.top),
          text: el.textContent, color: el.dataset.color || '#000000',
          opacity: parseFloat(el.dataset.opacity) || 0.8,
          w: el.style.width ? parseFloat(el.style.width) : null,
          h: el.style.height ? parseFloat(el.style.height) : null,
          fontSize: el.style.fontSize ? parseFloat(el.style.fontSize) : null };
      }
      return null;
    }

    function pasteSerializedItem(item, offX, offY) {
      // offX/offY are % offsets to apply
      if (item.type === 'circle') {
        addCircleAt(Math.min(98, item.left + offX), Math.min(98, item.top + offY), false);
        // Set number & color on the newly added circle
        const allC = inner.querySelectorAll('.tb-circle:not(.tb-circle-opp)');
        const last = allC[allC.length - 1];
        if (last) {
          const inp = last.querySelector('.tb-num');
          if (inp) { inp.value = item.num; }
          if (item.color) applyColorToCircle(last, item.color);
        }
      } else if (item.type === 'oppCircle') {
        addCircleAt(Math.min(98, item.left + offX), Math.min(98, item.top + offY), true);
        const allC = inner.querySelectorAll('.tb-circle-opp');
        const last = allC[allC.length - 1];
        if (last) {
          const inp = last.querySelector('.tb-num');
          if (inp) { inp.value = item.num; }
        }
      } else if (item.type === 'arrow') {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.classList.add('tb-arrow');
        line.setAttribute('x1', Math.min(98, item.x1 + offX) + '%');
        line.setAttribute('y1', Math.min(98, item.y1 + offY) + '%');
        line.setAttribute('x2', Math.min(98, item.x2 + offX) + '%');
        line.setAttribute('y2', Math.min(98, item.y2 + offY) + '%');
        line.dataset.color = item.color;
        line.style.stroke = item.color;
        line.setAttribute('stroke', item.color);
        if (item.dash) { line.dataset.dash = '1'; line.setAttribute('stroke-dasharray', '6 4'); }
        arrowsSvg.appendChild(line);
        reindexArrows(); saveArrows(); refreshArrowheads(arrowsSvg);
      } else if (item.type === 'penLine') {
        const offsetPts = item.points.split(/\s+/).map(pair => {
          const [x, y] = pair.split(',').map(Number);
          return Math.min(98, x + offX) + ',' + Math.min(98, y + offY);
        }).join(' ');
        spawnPenLine(offsetPts, item.color, item.dash);
        savePenLines();
      } else if (item.type === 'rect') {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.classList.add('tb-rect');
        rect.setAttribute('x', Math.min(98, item.x + offX) + '%');
        rect.setAttribute('y', Math.min(98, item.y + offY) + '%');
        rect.setAttribute('width', item.w + '%');
        rect.setAttribute('height', item.h + '%');
        rect.dataset.color = item.color;
        rect.dataset.opacity = item.opacity;
        rect.style.fill = item.color;
        rect.style.fillOpacity = item.opacity;
        rect.style.stroke = item.color;
        arrowsSvg.appendChild(rect);
        reindexRects(); saveRects();
      } else if (item.type === 'text') {
        createTextLabel(Math.min(98, item.left + offX), Math.min(98, item.top + offY),
          item.text, item.color, item.opacity, item.w, item.h, item.fontSize);
        saveTexts();
      } else if (item.type === 'ball') {
        spawnBall(Math.min(98, item.left + offX), Math.min(98, item.top + offY));
        saveBalls();
      } else if (item.type === 'cone') {
        spawnCone(Math.min(98, item.left + offX), Math.min(98, item.top + offY));
        saveCones();
      }
    }

    function duplicateElement(el) {
      const item = serializeElement(el);
      if (!item) return;
      pushUndo();
      pasteSerializedItem(item, PASTE_OFFSET, PASTE_OFFSET);
      autoSaveFrame();
    }

    function copyElementToClipboard(el) {
      const item = serializeElement(el);
      if (!item) return;
      tbClipboard = { items: [item] };
      // Visual feedback — brief flash
      el.classList.add('tb-copied-flash');
      setTimeout(() => el.classList.remove('tb-copied-flash'), 400);
    }

    function copySelectionToClipboard() {
      const items = [];
      selected.forEach(el => {
        const s = serializeElement(el);
        if (s) items.push(s);
      });
      if (!items.length) return;
      tbClipboard = { items };
      // Visual feedback
      selected.forEach(el => {
        el.classList.add('tb-copied-flash');
        setTimeout(() => el.classList.remove('tb-copied-flash'), 400);
      });
    }

    function pasteClipboardAtOffset(offX, offY) {
      if (!tbClipboard || !tbClipboard.items || !tbClipboard.items.length) return;
      pushUndo();
      tbClipboard.items.forEach(item => pasteSerializedItem(item, offX, offY));
      autoSaveFrame();
    }

    function duplicateSelection() {
      const items = [];
      selected.forEach(el => {
        const s = serializeElement(el);
        if (s) items.push(s);
      });
      if (!items.length) return;
      pushUndo();
      items.forEach(item => pasteSerializedItem(item, PASTE_OFFSET, PASTE_OFFSET));
      autoSaveFrame();
    }

    function makeDraggable(circle) {
      let dragging = false, startX, startY, startLeft, startTop;
      let groupStarts = [];
      const inp = circle.querySelector('.tb-num');

      function onPointerDown(e) {
        if (e.button === 2) return; // right-click handled separately
        e.preventDefault();

        // Select mode: toggle selection instead of dragging
        if (selectMode) {
          toggleSelect(circle);
          return;
        }

        // Ctrl+Click: toggle selection
        if (e.ctrlKey || e.metaKey) {
          toggleSelect(circle);
          return;
        }

        pushUndo();
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseFloat(circle.style.left);
        startTop = parseFloat(circle.style.top);
        circle.classList.add('tb-dragging');
        circle.setPointerCapture(e.pointerId);

        // If dragging a selected item, prepare group drag (includes arrows/rects)
        if (selected.has(circle) && selected.size > 1) {
          groupStarts = buildGroupStarts(circle);
        } else {
          groupStarts = [];
        }
      }
      function onPointerMove(e) {
        if (!dragging) return;
        const { dx, dy } = computeDelta(e, startX, startY);
        circle.style.left = Math.max(0, Math.min(100, startLeft + dx)) + '%';
        circle.style.top = Math.max(0, Math.min(100, startTop + dy)) + '%';
        groupStarts.forEach(g => moveEl(g.el, g.pos, dx, dy));
      }
      function onPointerUp() {
        if (!dragging) return;
        dragging = false;
        circle.classList.remove('tb-dragging');
        if (groupStarts.length) saveAll(); else saveState();
        groupStarts = [];
      }

      circle.addEventListener('pointerdown', onPointerDown);
      circle.addEventListener('pointermove', onPointerMove);
      circle.addEventListener('pointerup', onPointerUp);
      circle.addEventListener('pointercancel', onPointerUp);

      // Right-click context menu
      circle.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        const currentColor = circle.dataset.color || circle.style.backgroundColor || '#ffffff';
        const hexColor = currentColor.startsWith('#') ? currentColor : rgbToHex(currentColor);
        const items = [];

        // If multi-selected, offer group actions
        if (selected.has(circle) && selected.size > 1) {
          items.push({ label: 'Copy selected (' + selected.size + ')', action: () => copySelectionToClipboard() });
          items.push({ label: 'Duplicate selected (' + selected.size + ')', action: () => duplicateSelection() });
          items.push({
            type: 'color', value: hexColor,
            action: (col) => { pushUndo(); selected.forEach(c => applyColorToCircle(c, col)); }
          });
          items.push({
            label: 'Delete selected (' + selected.size + ')', danger: true,
            action: () => { pushUndo(); const toDelete = [...selected]; toDelete.forEach(c => deleteCircle(c)); }
          });
        } else {
          items.push({ label: 'Copy', action: () => copyElementToClipboard(circle) });
          items.push({ label: 'Duplicate', action: () => duplicateElement(circle) });
          items.push({
            type: 'color', value: hexColor,
            action: (col) => { pushUndo(); applyColorToCircle(circle, col); }
          });
          items.push({
            label: 'Delete', danger: true,
            action: () => { pushUndo(); deleteCircle(circle); }
          });
        }
        showCtxMenu(e.clientX, e.clientY, items);
      });

      circle.addEventListener('dblclick', () => {
        pushUndo();
        inp.style.pointerEvents = 'auto';
        inp.focus();
        inp.select();
      });
      inp.addEventListener('blur', () => {
        inp.style.pointerEvents = 'none';
        saveState();
      });
    }

    // Right-click on field to add player
    inner.addEventListener('contextmenu', e => {
      if (e.target.closest('.tb-circle') || e.target.closest('.tb-ball') || e.target.closest('.tb-silhouette')) return;
      e.preventDefault();
      const rect = inner.getBoundingClientRect();
      const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
      const vert = field.classList.contains('tb-vertical');
      let pctLeft, pctTop;
      if (isCssRotated && vert) {
        pctLeft = ((rect.bottom - e.clientY) / rect.height) * 100;
        pctTop = ((e.clientX - rect.left) / rect.width) * 100;
      } else {
        pctLeft = ((e.clientX - rect.left) / rect.width) * 100;
        pctTop = ((e.clientY - rect.top) / rect.height) * 100;
      }
      const items = [
        { label: 'Add player', action: () => addCircleAt(pctLeft, pctTop, false) }
      ];
      if (document.getElementById('tb-show-opp')?.checked) {
        items.push({ label: 'Add opponent', action: () => addCircleAt(pctLeft, pctTop, true) });
      }
      items.push({ label: 'Add ball', action: () => {
        pushUndo();
        spawnBall(pctLeft, pctTop);
        saveBalls(); autoSaveFrame();
        const ballsArr = JSON.parse(localStorage.getItem('fa_tactic_balls') || '[]');
        const newBall = ballsArr[ballsArr.length - 1];
        if (newBall) {
          for (let fi = activeFrameIdx + 1; fi < frames.length; fi++) {
            frames[fi].balls = (frames[fi].balls || []).concat([newBall]);
          }
          saveFrames();
        }
      } });
      // Multi-select actions when items are selected
      if (selected.size > 1) {
        items.push({ label: 'Copy selected (' + selected.size + ')', action: () => copySelectionToClipboard() });
        items.push({ label: 'Duplicate selected (' + selected.size + ')', action: () => duplicateSelection() });
        items.push({ label: 'Delete selected (' + selected.size + ')', danger: true,
          action: () => { pushUndo(); const toDelete = [...selected]; toDelete.forEach(el => {
            if (el.classList.contains('tb-circle')) deleteCircle(el);
            else if (el.classList.contains('tb-ball')) deleteBall(el);
            else if (el.classList.contains('tb-arrow')) deleteArrow(el);
            else if (el.classList.contains('tb-rect')) deleteRect(el);
            else if (el.classList.contains('tb-text-label')) { deleteTextLabel(el); autoSaveFrame(); }
            else if (el.classList.contains('tb-pen-line')) { el.remove(); savePenLines(); autoSaveFrame(); }
            else if (el.classList.contains('tb-cone')) { el.remove(); saveCones(); autoSaveFrame(); }
          }); }
        });
      }
      // Paste option — centered on tap position
      if (tbClipboard && tbClipboard.items && tbClipboard.items.length) {
        const n = tbClipboard.items.length;
        items.push({ label: 'Paste' + (n > 1 ? ' (' + n + ' items)' : ''), action: () => {
          // Compute center of clipboard items to offset relative to tap position
          let sumX = 0, sumY = 0, count = 0;
          tbClipboard.items.forEach(it => {
            if ('left' in it) { sumX += it.left; sumY += it.top; count++; }
            else if ('x1' in it) { sumX += (it.x1 + it.x2) / 2; sumY += (it.y1 + it.y2) / 2; count++; }
            else if ('x' in it) { sumX += it.x + it.w / 2; sumY += it.y + it.h / 2; count++; }
            else if ('points' in it) {
              const pts = it.points.split(/\s+/);
              if (pts.length) { const [px, py] = pts[0].split(',').map(Number); sumX += px; sumY += py; count++; }
            }
          });
          const cx = count ? sumX / count : 50;
          const cy = count ? sumY / count : 50;
          pasteClipboardAtOffset(pctLeft - cx, pctTop - cy);
        }});
      }
      showCtxMenu(e.clientX, e.clientY, items);
    });

    // Click on field background clears selection (skip in select mode so long-press context menu keeps selection)
    inner.addEventListener('pointerdown', e => {
      if (selectMode) return;
      if (!e.ctrlKey && !e.metaKey && !e.target.closest('.tb-circle') && !e.target.closest('.tb-ball') && !e.target.closest('.tb-arrow') && !e.target.closest('.tb-rect') && !e.target.closest('.tb-text-label') && !e.target.closest('.tb-cone')) {
        clearSelection();
        deselectAll();
      }
    });

    // Ctrl+Z undo
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (document.querySelector('.tb-field') && undoStack.length) {
          e.preventDefault();
          popUndo();
        }
      }
    });

    // --- Ctrl+C / Ctrl+V copy-paste ---
    let tbClipboard = null;
    document.addEventListener('keydown', e => {
      if (!(e.ctrlKey || e.metaKey) || !document.querySelector('.tb-field')) return;

      if (e.key === 'c' && !e.shiftKey) {
        // Multi-select copy
        if (selected.size > 0) {
          e.preventDefault();
          copySelectionToClipboard();
          return;
        }
        // Single-select fallback: check individually selected element
        const singleEl = selectedArrow || selectedRect || selectedTextLabel || selectedPenLine;
        if (singleEl) {
          e.preventDefault();
          copyElementToClipboard(singleEl);
          return;
        }
      }

      if (e.key === 'v' && !e.shiftKey && tbClipboard && tbClipboard.items && tbClipboard.items.length) {
        e.preventDefault();
        pasteClipboardAtOffset(PASTE_OFFSET, PASTE_OFFSET);
      }
    });

    // RGB string to hex helper
    function rgbToHex(rgb) {
      const m = rgb.match(/\d+/g);
      if (!m || m.length < 3) return '#ffffff';
      return '#' + m.slice(0,3).map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
    }

    // --- Arrows ---
    const arrowsSvg = document.getElementById('tb-arrows-svg');
    const arrowDefs = document.getElementById('tb-arrow-defs');
    let arrowMode = false;
    let rectMode = false;
    let textMode = false;
    let penMode = false;
    const arrowToolBtn = document.getElementById('tb-arrow-tool');
    const arrowColorInput = document.getElementById('tb-arrow-color');
    const arrowDashInput = document.getElementById('tb-arrow-dash');
    const rectToolBtn = document.getElementById('tb-rect-tool');
    const rectColorInput = document.getElementById('tb-rect-color');
    const rectOpacityInput = document.getElementById('tb-rect-opacity');
    const textToolBtn = document.getElementById('tb-text-tool');
    const textColorInput = document.getElementById('tb-text-color');
    const textOpacityInput = document.getElementById('tb-text-opacity');
    const textSizeInput = document.getElementById('tb-text-size');
    const penToolBtn = document.getElementById('tb-pen-tool');
    const penColorInput = document.getElementById('tb-pen-color');
    const penDashInput = document.getElementById('tb-pen-dash');
    let selectedPenLine = null;
    let selectedTextLabel = null;
    let selectedArrow = null;
    let selectedRect = null;

    function selectTextLabel(el) {
      if (selectedTextLabel) selectedTextLabel.classList.remove('tb-text-selected');
      selectedTextLabel = el;
      if (el) {
        el.classList.add('tb-text-selected');
        if (textColorInput) textColorInput.value = el.dataset.color || '#000000';
        if (textOpacityInput) textOpacityInput.value = Math.round((parseFloat(el.dataset.opacity) || 0.8) * 100);
        if (textSizeInput) textSizeInput.value = parseFloat(el.style.fontSize) || 12;
      }
    }
    function selectArrow(el) {
      if (selectedArrow) selectedArrow.classList.remove('tb-arrow-selected');
      selectedArrow = el;
      if (el) {
        el.classList.add('tb-arrow-selected');
        if (arrowColorInput) arrowColorInput.value = el.dataset.color || '#ffffff';
        if (arrowDashInput) arrowDashInput.checked = el.dataset.dash === '1';
      }
    }
    function selectRect(el) {
      if (selectedRect) selectedRect.classList.remove('tb-rect-selected');
      selectedRect = el;
      if (el) {
        el.classList.add('tb-rect-selected');
        if (rectColorInput) rectColorInput.value = el.dataset.color || '#ffffff';
        if (rectOpacityInput) rectOpacityInput.value = Math.round((parseFloat(el.dataset.opacity) || 0.3) * 100);
      }
    }
    function selectPenLine(el) {
      if (selectedPenLine) selectedPenLine.classList.remove('tb-pen-selected');
      selectedPenLine = el;
      if (el) {
        el.classList.add('tb-pen-selected');
        if (penColorInput) penColorInput.value = el.dataset.color || '#ffffff';
        if (penDashInput) penDashInput.checked = el.dataset.dash === '1';
      }
    }
    function deselectAll() {
      selectTextLabel(null);
      selectArrow(null);
      selectRect(null);
      selectPenLine(null);
    }

    function deactivateDrawTools() {
      arrowMode = false;
      rectMode = false;
      textMode = false;
      penMode = false;
      coneMode = false;
      selectMode = false;
      if (arrowToolBtn) arrowToolBtn.classList.remove('tb-arrow-tool-active');
      if (rectToolBtn) rectToolBtn.classList.remove('tb-rect-tool-active');
      if (textToolBtn) textToolBtn.classList.remove('tb-text-tool-active');
      if (penToolBtn) penToolBtn.classList.remove('tb-pen-tool-active');
      if (coneToolBtn) coneToolBtn.classList.remove('tb-cone-tool-active');
      const selectToolBtn = document.getElementById('tb-select-tool');
      if (selectToolBtn) selectToolBtn.classList.remove('tb-select-tool-active');
      inner.style.cursor = '';
    }

    if (arrowToolBtn) {
      arrowToolBtn.addEventListener('click', () => {
        const wasActive = arrowMode;
        deactivateDrawTools();
        if (!wasActive) {
          arrowMode = true;
          arrowToolBtn.classList.add('tb-arrow-tool-active');
          inner.style.cursor = 'crosshair';
        }
      });
    }
    if (arrowColorInput) {
      let arrowColorUndoPushed = false;
      arrowColorInput.addEventListener('pointerdown', () => { arrowColorUndoPushed = false; });
      arrowColorInput.addEventListener('input', () => {
        localStorage.setItem('fa_tactic_arrow_color', arrowColorInput.value);
        if (selectedArrow) {
          if (!arrowColorUndoPushed) { pushUndo(); arrowColorUndoPushed = true; }
          const col = arrowColorInput.value;
          selectedArrow.dataset.color = col;
          selectedArrow.style.stroke = col;
          selectedArrow.setAttribute('stroke', col);
          saveArrows(); refreshArrowheads(arrowsSvg); autoSaveFrame();
        }
      });
    }
    if (arrowDashInput) {
      arrowDashInput.addEventListener('change', () => {
        localStorage.setItem('fa_tactic_arrow_dash', arrowDashInput.checked ? 'true' : 'false');
        if (selectedArrow) {
          pushUndo();
          selectedArrow.dataset.dash = arrowDashInput.checked ? '1' : '';
          if (arrowDashInput.checked) selectedArrow.setAttribute('stroke-dasharray', '6 4');
          else selectedArrow.removeAttribute('stroke-dasharray');
          saveArrows(); autoSaveFrame();
        }
      });
    }
    if (rectToolBtn) {
      rectToolBtn.addEventListener('click', () => {
        const wasActive = rectMode;
        deactivateDrawTools();
        if (!wasActive) {
          rectMode = true;
          rectToolBtn.classList.add('tb-rect-tool-active');
          inner.style.cursor = 'crosshair';
        }
      });
    }
    if (rectColorInput) {
      rectColorInput.addEventListener('input', () => {
        localStorage.setItem('fa_tactic_rect_color', rectColorInput.value);
        if (selectedRect) {
          pushUndo();
          const col = rectColorInput.value;
          selectedRect.dataset.color = col;
          selectedRect.style.fill = col;
          selectedRect.style.stroke = col;
          saveRects(); autoSaveFrame();
        }
      });
    }
    if (rectOpacityInput) {
      rectOpacityInput.addEventListener('input', () => {
        localStorage.setItem('fa_tactic_rect_opacity', rectOpacityInput.value);
        if (selectedRect) {
          const op = Number(rectOpacityInput.value) / 100;
          selectedRect.dataset.opacity = op;
          selectedRect.style.fillOpacity = op;
          saveRects(); autoSaveFrame();
        }
      });
      rectOpacityInput.addEventListener('pointerdown', () => { if (selectedRect) pushUndo(); });
    }
    if (textToolBtn) {
      textToolBtn.addEventListener('click', () => {
        const wasActive = textMode;
        deactivateDrawTools();
        if (!wasActive) {
          textMode = true;
          textToolBtn.classList.add('tb-text-tool-active');
          inner.style.cursor = 'crosshair';
        }
      });
    }
    if (textColorInput) {
      textColorInput.addEventListener('input', () => {
        localStorage.setItem('fa_tactic_text_color', textColorInput.value);
        if (selectedTextLabel) {
          pushUndo();
          selectedTextLabel.dataset.color = textColorInput.value;
          selectedTextLabel.style.background = hexToRgba(textColorInput.value, parseFloat(selectedTextLabel.dataset.opacity) || 0.8);
          selectedTextLabel.style.color = textColorFor(textColorInput.value);
          saveTexts(); autoSaveFrame();
        }
      });
    }
    if (textOpacityInput) {
      textOpacityInput.addEventListener('input', () => {
        localStorage.setItem('fa_tactic_text_opacity', textOpacityInput.value);
        if (selectedTextLabel) {
          const op = Number(textOpacityInput.value) / 100;
          selectedTextLabel.dataset.opacity = op;
          selectedTextLabel.style.background = hexToRgba(selectedTextLabel.dataset.color || '#000000', op);
          saveTexts(); autoSaveFrame();
        }
      });
      textOpacityInput.addEventListener('pointerdown', () => { if (selectedTextLabel) pushUndo(); });
    }
    if (textSizeInput) {
      textSizeInput.addEventListener('input', () => {
        localStorage.setItem('fa_tactic_text_size', textSizeInput.value);
        if (selectedTextLabel) {
          selectedTextLabel.style.fontSize = textSizeInput.value + 'px';
          saveTexts(); autoSaveFrame();
        }
      });
      textSizeInput.addEventListener('pointerdown', () => { if (selectedTextLabel) pushUndo(); });
    }

    function saveArrows() {
      const lines = arrowsSvg.querySelectorAll('.tb-arrow');
      const arrows = [];
      lines.forEach(l => {
        // Use original endpoints (before refreshArrowheads shortened them for display)
        const x1 = parseFloat(l.dataset.origX1 || l.getAttribute('x1'));
        const y1 = parseFloat(l.dataset.origY1 || l.getAttribute('y1'));
        const x2 = parseFloat(l.dataset.origX2 || l.getAttribute('x2'));
        const y2 = parseFloat(l.dataset.origY2 || l.getAttribute('y2'));
        const h1 = toHorizontal(x1, y1);
        const h2 = toHorizontal(x2, y2);
        arrows.push([Math.round(h1[0]*100)/100, Math.round(h1[1]*100)/100,
                      Math.round(h2[0]*100)/100, Math.round(h2[1]*100)/100,
                      l.dataset.color || '#ffffff',
                      l.dataset.dash === '1']);
      });
      localStorage.setItem('fa_tactic_arrows', JSON.stringify(arrows));
    }

    function deleteArrow(lineEl) {
      lineEl.remove();
      reindexArrows();
      saveArrows();
      refreshArrowheads(arrowsSvg);
      autoSaveFrame();
    }

    function reindexArrows() {
      arrowsSvg.querySelectorAll('.tb-arrow').forEach((l, i) => l.dataset.idx = i);
    }

    // Arrow right-click
    arrowsSvg.addEventListener('contextmenu', e => {
      const line = e.target.closest('.tb-arrow');
      const pen = e.target.closest('.tb-pen-line');
      if (line) {
        e.preventDefault();
        e.stopPropagation();
        showCtxMenu(e.clientX, e.clientY, [
          { label: 'Copy', action: () => copyElementToClipboard(line) },
          { label: 'Duplicate', action: () => duplicateElement(line) },
          { label: 'Delete arrow', danger: true, action: () => { pushUndo(); deleteArrow(line); } }
        ]);
      } else if (pen) {
        e.preventDefault();
        e.stopPropagation();
        showCtxMenu(e.clientX, e.clientY, [
          { label: 'Copy', action: () => copyElementToClipboard(pen) },
          { label: 'Duplicate', action: () => duplicateElement(pen) },
          { label: 'Delete pen line', danger: true, action: () => { pushUndo(); pen.remove(); savePenLines(); autoSaveFrame(); } }
        ]);
      }
    });

    // --- Pen tool ---
    function savePenLines() {
      const lines = arrowsSvg.querySelectorAll('.tb-pen-line');
      const arr = [];
      lines.forEach(pl => {
        const pts = pl.getAttribute('points') || '';
        // Store raw display points + color + dash
        arr.push([pts, pl.dataset.color || '#ffffff', pl.dataset.dash === '1']);
      });
      localStorage.setItem('fa_tactic_pen_lines', JSON.stringify(arr));
    }

    function spawnPenLine(pointsStr, color, dash) {
      const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      pl.classList.add('tb-pen-line');
      pl.setAttribute('points', pointsStr);
      pl.style.stroke = color;
      pl.dataset.color = color;
      pl.dataset.dash = dash ? '1' : '';
      if (dash) pl.setAttribute('stroke-dasharray', '6 4');
      arrowsSvg.appendChild(pl);
      return pl;
    }

    // Restore saved pen lines
    const savedPenLines = JSON.parse(localStorage.getItem('fa_tactic_pen_lines') || '[]');
    savedPenLines.forEach(p => spawnPenLine(p[0], p[1], p[2]));

    if (penToolBtn) {
      penToolBtn.addEventListener('click', () => {
        const wasActive = penMode;
        deactivateDrawTools();
        if (!wasActive) {
          penMode = true;
          penToolBtn.classList.add('tb-pen-tool-active');
          inner.style.cursor = 'crosshair';
        }
      });
    }
    if (penColorInput) {
      penColorInput.addEventListener('input', () => {
        localStorage.setItem('fa_tactic_pen_color', penColorInput.value);
        if (selectedPenLine) {
          pushUndo();
          const col = penColorInput.value;
          selectedPenLine.style.stroke = col;
          selectedPenLine.dataset.color = col;
          savePenLines();
          autoSaveFrame();
        }
      });
    }
    if (penDashInput) {
      penDashInput.addEventListener('change', () => {
        localStorage.setItem('fa_tactic_pen_dash', penDashInput.checked);
        if (selectedPenLine) {
          pushUndo();
          selectedPenLine.dataset.dash = penDashInput.checked ? '1' : '';
          if (penDashInput.checked) selectedPenLine.setAttribute('stroke-dasharray', '6 4');
          else selectedPenLine.removeAttribute('stroke-dasharray');
          savePenLines();
          autoSaveFrame();
        }
      });
    }

    // Pen freehand draw handlers
    let penDraw = null;
    inner.addEventListener('pointerdown', e => {
      if (!penMode) return;
      if (e.target.closest('.tb-circle') || e.target.closest('.tb-ball')) return;
      if (e.button !== 0) return;
      e.preventDefault();
      const rect = inner.getBoundingClientRect();
      const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
      const vert = field.classList.contains('tb-vertical');
      function toPct(ev) {
        let px, py;
        if (isCssRotated && vert) {
          px = ((rect.bottom - ev.clientY) / rect.height) * 100;
          py = ((ev.clientX - rect.left) / rect.width) * 100;
        } else {
          px = ((ev.clientX - rect.left) / rect.width) * 100;
          py = ((ev.clientY - rect.top) / rect.height) * 100;
        }
        return [Math.max(0, Math.min(100, px)), Math.max(0, Math.min(100, py))];
      }
      const [sx, sy] = toPct(e);
      const pColor = penColorInput ? penColorInput.value : '#ffffff';
      const pDash = penDashInput ? penDashInput.checked : false;
      const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      pl.classList.add('tb-pen-line', 'tb-pen-drawing');
      pl.style.stroke = pColor;
      pl.dataset.color = pColor;
      pl.dataset.dash = pDash ? '1' : '';
      if (pDash) pl.setAttribute('stroke-dasharray', '6 4');
      pl.setAttribute('points', sx + ',' + sy);
      arrowsSvg.appendChild(pl);
      penDraw = { el: pl, toPct, points: [[sx, sy]] };
      inner.setPointerCapture(e.pointerId);
    });
    inner.addEventListener('pointermove', e => {
      if (!penDraw) return;
      const [px, py] = penDraw.toPct(e);
      penDraw.points.push([px, py]);
      // Downsample: skip if very close to last recorded point
      const pts = penDraw.points;
      const last = pts[pts.length - 2];
      if (last && Math.abs(px - last[0]) < 0.5 && Math.abs(py - last[1]) < 0.5) {
        penDraw.points.pop();
        return;
      }
      penDraw.el.setAttribute('points', penDraw.points.map(p => p[0]+','+p[1]).join(' '));
    });
    inner.addEventListener('pointerup', e => {
      if (!penDraw) return;
      penDraw.el.classList.remove('tb-pen-drawing');
      // If too short (fewer than 3 points), discard
      if (penDraw.points.length < 3) {
        penDraw.el.remove();
      } else {
        pushUndo();
        savePenLines();
        autoSaveFrame();
      }
      penDraw = null;
    });

    // --- Drag arrows, rects & pen lines ---
    let svgDrag = null;
    arrowsSvg.addEventListener('pointerdown', e => {
      if (arrowMode || rectMode || penMode) return; // in draw mode, don't drag
      const target = e.target.closest('.tb-arrow') || e.target.closest('.tb-rect') || e.target.closest('.tb-pen-line');
      if (!target) return;
      if (e.button === 2) return; // right-click
      e.preventDefault();
      e.stopPropagation();

      // Select mode: toggle selection instead of dragging
      if (selectMode) {
        toggleSelect(target);
        return;
      }

      // Select the element for toolbar editing
      if (target.classList.contains('tb-arrow')) {
        deselectAll();
        selectArrow(target);
      } else if (target.classList.contains('tb-rect')) {
        deselectAll();
        selectRect(target);
      } else if (target.classList.contains('tb-pen-line')) {
        deselectAll();
        selectPenLine(target);
      }

      // Ctrl+Click: toggle selection
      if (e.ctrlKey || e.metaKey) {
        toggleSelect(target);
        return;
      }

      const startPos = getElPos(target);
      svgDrag = {
        el: target,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startPos,
        groupStarts: (selected.has(target) && selected.size > 1) ? buildGroupStarts(target) : []
      };
      target.setPointerCapture(e.pointerId);
    });
    arrowsSvg.addEventListener('pointermove', e => {
      if (!svgDrag) return;
      const { dx, dy } = computeDelta(e, svgDrag.startClientX, svgDrag.startClientY);
      moveEl(svgDrag.el, svgDrag.startPos, dx, dy);
      svgDrag.groupStarts.forEach(g => moveEl(g.el, g.pos, dx, dy));
    });
    arrowsSvg.addEventListener('pointerup', e => {
      if (!svgDrag) return;
      pushUndo();
      if (svgDrag.groupStarts.length) saveAll();
      else {
        if (svgDrag.el.classList.contains('tb-arrow')) saveArrows();
        else if (svgDrag.el.classList.contains('tb-pen-line')) savePenLines();
        else saveRects();
      }
      refreshArrowheads(arrowsSvg);
      autoSaveFrame();
      svgDrag = null;
    });
    arrowsSvg.addEventListener('pointercancel', () => { svgDrag = null; });

    // Draw arrows: click-drag when arrow tool is active
    let arrowDraw = null;
    inner.addEventListener('pointerdown', e => {
      if (!arrowMode) return;
      if (e.target.closest('.tb-circle') || e.target.closest('.tb-ball')) return;
      if (e.button !== 0) return;
      e.preventDefault();
      const rect = inner.getBoundingClientRect();
      const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
      const vert = field.classList.contains('tb-vertical');
      let pctX, pctY;
      if (isCssRotated && vert) {
        pctX = ((rect.bottom - e.clientY) / rect.height) * 100;
        pctY = ((e.clientX - rect.left) / rect.width) * 100;
      } else {
        pctX = ((e.clientX - rect.left) / rect.width) * 100;
        pctY = ((e.clientY - rect.top) / rect.height) * 100;
      }
      const aColor = arrowColorInput ? arrowColorInput.value : '#ffffff';
      const aDash = arrowDashInput ? arrowDashInput.checked : false;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.classList.add('tb-arrow', 'tb-arrow-drawing');
      line.setAttribute('x1', pctX + '%');
      line.setAttribute('y1', pctY + '%');
      line.setAttribute('x2', pctX + '%');
      line.setAttribute('y2', pctY + '%');
      line.style.stroke = aColor;
      line.setAttribute('stroke', aColor);
      line.dataset.color = aColor;
      line.dataset.dash = aDash ? '1' : '';
      if (aDash) line.setAttribute('stroke-dasharray', '6 4');
      arrowsSvg.appendChild(line);
      arrowDraw = { line };
      inner.setPointerCapture(e.pointerId);
    });
    inner.addEventListener('pointermove', e => {
      if (!arrowDraw) return;
      const rect = inner.getBoundingClientRect();
      const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
      const vert = field.classList.contains('tb-vertical');
      let pctX, pctY;
      if (isCssRotated && vert) {
        pctX = ((rect.bottom - e.clientY) / rect.height) * 100;
        pctY = ((e.clientX - rect.left) / rect.width) * 100;
      } else {
        pctX = ((e.clientX - rect.left) / rect.width) * 100;
        pctY = ((e.clientY - rect.top) / rect.height) * 100;
      }
      pctX = Math.max(0, Math.min(100, pctX));
      pctY = Math.max(0, Math.min(100, pctY));
      arrowDraw.line.setAttribute('x2', pctX + '%');
      arrowDraw.line.setAttribute('y2', pctY + '%');
    });
    inner.addEventListener('pointerup', e => {
      if (!arrowDraw) return;
      const line = arrowDraw.line;
      line.classList.remove('tb-arrow-drawing');
      // If too short, remove
      const dx = parseFloat(line.getAttribute('x2')) - parseFloat(line.getAttribute('x1'));
      const dy = parseFloat(line.getAttribute('y2')) - parseFloat(line.getAttribute('y1'));
      if (Math.sqrt(dx*dx + dy*dy) < 2) {
        line.remove();
      } else {
        reindexArrows();
        pushUndo();
        saveArrows();
        refreshArrowheads(arrowsSvg);
      }
      arrowDraw = null;
    });

    // --- Rectangles ---
    function saveRects() {
      const rects = arrowsSvg.querySelectorAll('.tb-rect');
      const arr = [];
      rects.forEach(r => {
        const x = parseFloat(r.getAttribute('x'));
        const y = parseFloat(r.getAttribute('y'));
        const w = parseFloat(r.getAttribute('width'));
        const h = parseFloat(r.getAttribute('height'));
        const tl = toHorizontal(x, y);
        const br = toHorizontal(x + w, y + h);
        const hx = Math.min(tl[0], br[0]);
        const hy = Math.min(tl[1], br[1]);
        const hw = Math.abs(br[0] - tl[0]);
        const hh = Math.abs(br[1] - tl[1]);
        arr.push([Math.round(hx*100)/100, Math.round(hy*100)/100,
                   Math.round(hw*100)/100, Math.round(hh*100)/100,
                   r.dataset.color || '#ffffff',
                   parseFloat(r.dataset.opacity) || 0.3]);
      });
      localStorage.setItem('fa_tactic_rects', JSON.stringify(arr));
    }

    function deleteRect(rectEl) {
      rectEl.remove();
      reindexRects();
      saveRects();
    }

    function reindexRects() {
      arrowsSvg.querySelectorAll('.tb-rect').forEach((r, i) => r.dataset.idx = i);
    }

    // Rect right-click
    arrowsSvg.addEventListener('contextmenu', e => {
      const rectEl = e.target.closest('.tb-rect');
      if (!rectEl) return;
      e.preventDefault();
      e.stopPropagation();
      showCtxMenu(e.clientX, e.clientY, [
        { label: 'Copy', action: () => copyElementToClipboard(rectEl) },
        { label: 'Duplicate', action: () => duplicateElement(rectEl) },
        { label: 'Delete rectangle', danger: true, action: () => { pushUndo(); deleteRect(rectEl); } }
      ]);
    });

    // Draw rects: click-drag when rect tool is active
    let rectDraw = null;
    inner.addEventListener('pointerdown', e => {
      if (!rectMode) return;
      if (e.target.closest('.tb-circle') || e.target.closest('.tb-ball')) return;
      if (e.button !== 0) return;
      e.preventDefault();
      const bounds = inner.getBoundingClientRect();
      const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
      const vert = field.classList.contains('tb-vertical');
      let pctX, pctY;
      if (isCssRotated && vert) {
        pctX = ((bounds.bottom - e.clientY) / bounds.height) * 100;
        pctY = ((e.clientX - bounds.left) / bounds.width) * 100;
      } else {
        pctX = ((e.clientX - bounds.left) / bounds.width) * 100;
        pctY = ((e.clientY - bounds.top) / bounds.height) * 100;
      }
      const rColor = rectColorInput ? rectColorInput.value : '#ffffff';
      const rOp = rectOpacityInput ? (parseInt(rectOpacityInput.value, 10) / 100) : 0.3;
      const svgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      svgRect.classList.add('tb-rect', 'tb-rect-drawing');
      svgRect.setAttribute('x', pctX + '%');
      svgRect.setAttribute('y', pctY + '%');
      svgRect.setAttribute('width', '0%');
      svgRect.setAttribute('height', '0%');
      svgRect.style.fill = rColor;
      svgRect.style.fillOpacity = rOp;
      svgRect.style.stroke = rColor;
      svgRect.dataset.color = rColor;
      svgRect.dataset.opacity = rOp;
      // Insert rects before arrows so arrows render on top
      const firstArrow = arrowsSvg.querySelector('.tb-arrow');
      if (firstArrow) arrowsSvg.insertBefore(svgRect, firstArrow);
      else arrowsSvg.appendChild(svgRect);
      rectDraw = { el: svgRect, startX: pctX, startY: pctY };
      inner.setPointerCapture(e.pointerId);
    });
    inner.addEventListener('pointermove', e => {
      if (!rectDraw) return;
      const bounds = inner.getBoundingClientRect();
      const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
      const vert = field.classList.contains('tb-vertical');
      let pctX, pctY;
      if (isCssRotated && vert) {
        pctX = ((bounds.bottom - e.clientY) / bounds.height) * 100;
        pctY = ((e.clientX - bounds.left) / bounds.width) * 100;
      } else {
        pctX = ((e.clientX - bounds.left) / bounds.width) * 100;
        pctY = ((e.clientY - bounds.top) / bounds.height) * 100;
      }
      pctX = Math.max(0, Math.min(100, pctX));
      pctY = Math.max(0, Math.min(100, pctY));
      const x = Math.min(rectDraw.startX, pctX);
      const y = Math.min(rectDraw.startY, pctY);
      const w = Math.abs(pctX - rectDraw.startX);
      const h = Math.abs(pctY - rectDraw.startY);
      rectDraw.el.setAttribute('x', x + '%');
      rectDraw.el.setAttribute('y', y + '%');
      rectDraw.el.setAttribute('width', w + '%');
      rectDraw.el.setAttribute('height', h + '%');
    });
    inner.addEventListener('pointerup', e => {
      if (!rectDraw) return;
      const el = rectDraw.el;
      el.classList.remove('tb-rect-drawing');
      const w = parseFloat(el.getAttribute('width'));
      const h = parseFloat(el.getAttribute('height'));
      if (w < 1 && h < 1) {
        el.remove();
      } else {
        reindexRects();
        pushUndo();
        saveRects();
      }
      rectDraw = null;
    });

    // --- Text labels ---
    function saveTexts() {
      const labels = inner.querySelectorAll('.tb-text-label');
      const arr = [];
      labels.forEach(el => {
        const dL = parseFloat(el.style.left);
        const dT = parseFloat(el.style.top);
        const h = toHorizontal(dL, dT);
        const elW = el.style.width ? parseFloat(el.style.width) : null;
        const elH = el.style.height ? parseFloat(el.style.height) : null;
        const elFs = el.style.fontSize ? parseFloat(el.style.fontSize) : null;
        arr.push([Math.round(h[0]*100)/100, Math.round(h[1]*100)/100,
                   el.textContent,
                   el.dataset.color || '#000000',
                   parseFloat(el.dataset.opacity) || 0.8,
                   elW, elH, elFs]);
      });
      localStorage.setItem('fa_tactic_texts', JSON.stringify(arr));
    }

    function reindexTexts() {
      inner.querySelectorAll('.tb-text-label').forEach((el, i) => el.dataset.idx = i);
    }

    function deleteTextLabel(el) {
      el.remove();
      reindexTexts();
      saveTexts();
    }

    function createTextLabel(pctLeft, pctTop, text, color, opacity, w, h, fontSize) {
      const div = document.createElement('div');
      div.className = 'tb-text-label';
      div.style.left = pctLeft + '%';
      div.style.top = pctTop + '%';
      div.style.background = hexToRgba(color, opacity);
      div.style.color = textColorFor(color);
      div.dataset.color = color;
      div.dataset.opacity = opacity;
      if (w) div.style.width = w + 'px';
      if (h) div.style.height = h + 'px';
      if (fontSize) div.style.fontSize = fontSize + 'px';
      div.textContent = text;
      makeTextDraggable(div);
      inner.appendChild(div);
      reindexTexts();
      return div;
    }

    function makeTextDraggable(el) {
      let dragging = false, startX, startY, startLeft, startTop;
      el.addEventListener('pointerdown', e => {
        if (e.button === 2) return;
        // Allow native resize when clicking near bottom-right corner
        const r = el.getBoundingClientRect();
        if (e.clientX > r.right - 18 && e.clientY > r.bottom - 18) return;
        e.preventDefault();
        e.stopPropagation();
        // Select mode: toggle selection instead of dragging
        if (selectMode) { toggleSelect(el); return; }
        // Ctrl+Click: toggle selection
        if (e.ctrlKey || e.metaKey) {
          toggleSelect(el);
          return;
        }
        deselectAll();
        selectTextLabel(el);
        pushUndo();
        dragging = true;
        startX = e.clientX; startY = e.clientY;
        startLeft = parseFloat(el.style.left);
        startTop = parseFloat(el.style.top);
        el.classList.add('tb-dragging');
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', e => {
        if (!dragging) return;
        const rect = inner.getBoundingClientRect();
        const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
        const vert = field.classList.contains('tb-vertical');
        let dx, dy;
        if (isCssRotated && vert) {
          dx = -((e.clientY - startY) / rect.height) * 100;
          dy = ((e.clientX - startX) / rect.width) * 100;
        } else {
          dx = ((e.clientX - startX) / rect.width) * 100;
          dy = ((e.clientY - startY) / rect.height) * 100;
        }
        el.style.left = Math.max(0, Math.min(100, startLeft + dx)) + '%';
        el.style.top = Math.max(0, Math.min(100, startTop + dy)) + '%';
      });
      el.addEventListener('pointerup', () => {
        if (!dragging) return;
        dragging = false;
        el.classList.remove('tb-dragging');
        saveTexts();
        autoSaveFrame();
      });
      el.addEventListener('pointercancel', () => {
        if (!dragging) return;
        dragging = false;
        el.classList.remove('tb-dragging');
        saveTexts();
      });
      // Save after native resize
      let resizeTimer = null;
      new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { saveTexts(); autoSaveFrame(); }, 300);
      }).observe(el);
      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        const curColor = el.dataset.color || '#000000';
        const items = [
          { label: 'Copy', action: () => copyElementToClipboard(el) },
          { label: 'Duplicate', action: () => duplicateElement(el) },
          { type: 'color', value: curColor, action: (col) => {
            pushUndo();
            el.dataset.color = col;
            el.style.background = hexToRgba(col, parseFloat(el.dataset.opacity) || 0.8);
            el.style.color = textColorFor(col);
            saveTexts();
            autoSaveFrame();
          }},
          { label: 'Edit text', action: () => {
            const oldText = el.textContent;
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.className = 'tb-text-inline-input';
            inp.style.left = el.style.left;
            inp.style.top = el.style.top;
            inp.value = oldText;
            el.style.visibility = 'hidden';
            inner.appendChild(inp);
            inp.focus();
            inp.select();
            function commitEdit() {
              const txt = inp.value.trim();
              inp.remove();
              el.style.visibility = '';
              if (txt && txt !== oldText) {
                pushUndo();
                el.textContent = txt;
                saveTexts();
                autoSaveFrame();
              }
            }
            inp.addEventListener('keydown', ev => {
              if (ev.key === 'Enter') { ev.preventDefault(); commitEdit(); }
              if (ev.key === 'Escape') { inp.remove(); el.style.visibility = ''; }
            });
            inp.addEventListener('blur', () => { commitEdit(); });
          }},
          { type: 'range', label: 'Size', min: 8, max: 28, value: parseFloat(el.style.fontSize) || 12, action: (val) => {
            pushUndo();
            el.style.fontSize = val + 'px';
            saveTexts();
            autoSaveFrame();
          }},
          { label: 'Delete', danger: true, action: () => {
            pushUndo();
            deleteTextLabel(el);
            autoSaveFrame();
          }}
        ];
        showCtxMenu(e.clientX, e.clientY, items);
      });
    }

    // Bind existing text labels
    inner.querySelectorAll('.tb-text-label').forEach(el => makeTextDraggable(el));

    // Click to place text when text tool is active
    function placeTextAt(pctX, pctY) {
      // Create inline input at position
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.className = 'tb-text-inline-input';
      inp.style.left = pctX + '%';
      inp.style.top = pctY + '%';
      inp.placeholder = 'Type text…';
      inner.appendChild(inp);
      inp.focus();
      function commit() {
        const text = inp.value.trim();
        inp.remove();
        if (!text) return;
        const color = textColorInput ? textColorInput.value : '#000000';
        const opacity = textOpacityInput ? (Number(textOpacityInput.value) / 100) : 0.8;
        const fontSize = textSizeInput ? Number(textSizeInput.value) : 12;
        pushUndo();
        createTextLabel(pctX, pctY, text, color, opacity, null, null, fontSize);
        saveTexts();
        autoSaveFrame();
      }
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { inp.remove(); }
      });
      inp.addEventListener('blur', () => { commit(); });
    }
    inner.addEventListener('pointerdown', e => {
      if (!textMode) return;
      if (e.target.closest('.tb-text-label') || e.target.closest('.tb-circle') || e.target.closest('.tb-ball') || e.target.closest('.tb-text-inline-input')) return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const bounds = inner.getBoundingClientRect();
      const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
      const vert = field.classList.contains('tb-vertical');
      let pctX, pctY;
      if (isCssRotated && vert) {
        pctX = ((bounds.bottom - e.clientY) / bounds.height) * 100;
        pctY = ((e.clientX - bounds.left) / bounds.width) * 100;
      } else {
        pctX = ((e.clientX - bounds.left) / bounds.width) * 100;
        pctY = ((e.clientY - bounds.top) / bounds.height) * 100;
      }
      // Remove any existing inline input
      inner.querySelectorAll('.tb-text-inline-input').forEach(i => i.remove());
      placeTextAt(pctX, pctY);
    });

    function saveBalls() {
      const balls = inner.querySelectorAll('.tb-ball');
      const arr = [];
      balls.forEach((b, i) => {
        b.dataset.idx = i;
        const bL = parseFloat(b.style.left), bT = parseFloat(b.style.top);
        const bH = toHorizontal(bL, bT);
        arr.push([Math.round(bH[0]*100)/100, Math.round(bH[1]*100)/100]);
      });
      localStorage.setItem('fa_tactic_balls', JSON.stringify(arr));
    }

    function spawnBall(pctX, pctY) {
      const existing = inner.querySelectorAll('.tb-ball');
      const idx = existing.length;
      const div = document.createElement('div');
      div.className = 'tb-ball';
      div.dataset.idx = idx;
      div.style.left = pctX + '%';
      div.style.top = pctY + '%';
      makeBallDraggable(div);
      inner.appendChild(div);
      return div;
    }

    // Make ball draggable
    function makeBallDraggable(ball) {
      let dragging = false, startX, startY, startLeft, startTop;
      ball.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        // Select mode: toggle selection instead of dragging
        if (selectMode) { toggleSelect(ball); return; }
        // Ctrl+Click: toggle selection
        if (e.ctrlKey || e.metaKey) {
          toggleSelect(ball);
          return;
        }
        pushUndo();
        dragging = true;
        startX = e.clientX; startY = e.clientY;
        startLeft = parseFloat(ball.style.left);
        startTop = parseFloat(ball.style.top);
        ball.classList.add('tb-dragging');
        ball.setPointerCapture(e.pointerId);
      });
      ball.addEventListener('pointermove', e => {
        if (!dragging) return;
        const rect = inner.getBoundingClientRect();
        const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
        const vert = field.classList.contains('tb-vertical');
        let dx, dy;
        if (isCssRotated && vert) {
          dx = -((e.clientY - startY) / rect.height) * 100;
          dy = ((e.clientX - startX) / rect.width) * 100;
        } else {
          dx = ((e.clientX - startX) / rect.width) * 100;
          dy = ((e.clientY - startY) / rect.height) * 100;
        }
        ball.style.left = Math.max(0, Math.min(100, startLeft + dx)) + '%';
        ball.style.top = Math.max(0, Math.min(100, startTop + dy)) + '%';
      });
      ball.addEventListener('pointerup', () => {
        if (!dragging) return;
        dragging = false;
        ball.classList.remove('tb-dragging');
        saveBalls(); autoSaveFrame();
      });
      ball.addEventListener('pointercancel', () => {
        if (!dragging) return;
        dragging = false;
        ball.classList.remove('tb-dragging');
        saveBalls(); autoSaveFrame();
      });
      ball.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation();
        showCtxMenu(e.clientX, e.clientY, [
          { label: 'Copy', action: () => copyElementToClipboard(ball) },
          { label: 'Duplicate', action: () => duplicateElement(ball) },
          { label: 'Delete ball', danger: true, action: () => { pushUndo(); deleteBall(ball); } }
        ]);
      });
    }

    function deleteBall(ball) {
      const idx = Number(ball.dataset.idx);
      ball.remove();
      selected.delete(ball);
      saveBalls();
      autoSaveFrame();
      // Null out this ball in all future frames
      for (let fi = activeFrameIdx + 1; fi < frames.length; fi++) {
        const arr = frames[fi].balls || [];
        if (idx < arr.length) {
          arr[idx] = null;
          frames[fi].balls = arr;
        }
      }
      saveFrames();
    }

    inner.querySelectorAll('.tb-ball').forEach(b => makeBallDraggable(b));

    // Ball tool — add ball on click
    const ballToolBtn = document.getElementById('tb-ball-tool');
    if (ballToolBtn) {
      ballToolBtn.addEventListener('click', () => {
        pushUndo();
        spawnBall(50, 50);
        saveBalls();
        autoSaveFrame();
        // Propagate new ball to future frames
        const ballsArr = JSON.parse(localStorage.getItem('fa_tactic_balls') || '[]');
        const newBall = ballsArr[ballsArr.length - 1];
        if (newBall) {
          for (let fi = activeFrameIdx + 1; fi < frames.length; fi++) {
            frames[fi].balls = (frames[fi].balls || []).concat([newBall]);
          }
          saveFrames();
        }
      });
    }

    // --- Cones ---
    let coneMode = false;
    const coneToolBtn = document.getElementById('tb-cone-tool');

    function saveCones() {
      const cones = inner.querySelectorAll('.tb-cone');
      const arr = [];
      cones.forEach(c => {
        const cL = parseFloat(c.style.left), cT = parseFloat(c.style.top);
        const cH = toHorizontal(cL, cT);
        arr.push([Math.round(cH[0]*100)/100, Math.round(cH[1]*100)/100]);
      });
      localStorage.setItem('fa_tactic_cones', JSON.stringify(arr));
    }

    function spawnCone(pctX, pctY) {
      const div = document.createElement('div');
      div.className = 'tb-cone';
      div.style.left = pctX + '%';
      div.style.top = pctY + '%';
      makeConeDraggable(div);
      inner.appendChild(div);
      return div;
    }

    function makeConeDraggable(cone) {
      let dragging = false, startX, startY, startLeft, startTop;
      cone.addEventListener('pointerdown', e => {
        if (coneMode) return;
        e.preventDefault(); e.stopPropagation();
        // Select mode: toggle selection instead of dragging
        if (selectMode) { toggleSelect(cone); return; }
        // Ctrl+Click: toggle selection
        if (e.ctrlKey || e.metaKey) {
          toggleSelect(cone);
          return;
        }
        pushUndo();
        dragging = true;
        startX = e.clientX; startY = e.clientY;
        startLeft = parseFloat(cone.style.left);
        startTop = parseFloat(cone.style.top);
        cone.classList.add('tb-dragging');
        cone.setPointerCapture(e.pointerId);
      });
      cone.addEventListener('pointermove', e => {
        if (!dragging) return;
        const rect = inner.getBoundingClientRect();
        const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
        const vert = field.classList.contains('tb-vertical');
        let dx, dy;
        if (isCssRotated && vert) {
          dx = -((e.clientY - startY) / rect.height) * 100;
          dy = ((e.clientX - startX) / rect.width) * 100;
        } else {
          dx = ((e.clientX - startX) / rect.width) * 100;
          dy = ((e.clientY - startY) / rect.height) * 100;
        }
        cone.style.left = Math.max(0, Math.min(100, startLeft + dx)) + '%';
        cone.style.top = Math.max(0, Math.min(100, startTop + dy)) + '%';
      });
      cone.addEventListener('pointerup', () => {
        if (!dragging) return;
        dragging = false;
        cone.classList.remove('tb-dragging');
        saveCones(); autoSaveFrame();
      });
      cone.addEventListener('pointercancel', () => {
        if (!dragging) return;
        dragging = false;
        cone.classList.remove('tb-dragging');
        saveCones(); autoSaveFrame();
      });
      cone.addEventListener('contextmenu', e => {
        e.preventDefault(); e.stopPropagation();
        showCtxMenu(e.clientX, e.clientY, [
          { label: 'Copy', action: () => copyElementToClipboard(cone) },
          { label: 'Duplicate', action: () => duplicateElement(cone) },
          { label: 'Delete cone', danger: true, action: () => { pushUndo(); cone.remove(); saveCones(); autoSaveFrame(); } }
        ]);
      });
    }

    // Init existing cones
    inner.querySelectorAll('.tb-cone').forEach(c => makeConeDraggable(c));

    // Cone tool toggle
    if (coneToolBtn) {
      coneToolBtn.addEventListener('click', () => {
        const wasActive = coneMode;
        deactivateDrawTools();
        if (!wasActive) {
          coneMode = true;
          coneToolBtn.classList.add('tb-cone-tool-active');
          inner.style.cursor = 'crosshair';
        }
      });
    }

    // Place cone on click
    inner.addEventListener('click', e => {
      if (!coneMode) return;
      if (e.target.closest('.tb-cone') || e.target.closest('.tb-circle') || e.target.closest('.tb-ball')) return;
      const rect = inner.getBoundingClientRect();
      const isCssRotated = field.classList.contains('tb-half') || field.classList.contains('tb-area');
      const vert = field.classList.contains('tb-vertical');
      let pctX, pctY;
      if (isCssRotated && vert) {
        pctX = ((rect.bottom - e.clientY) / rect.height) * 100;
        pctY = ((e.clientX - rect.left) / rect.width) * 100;
      } else {
        pctX = ((e.clientX - rect.left) / rect.width) * 100;
        pctY = ((e.clientY - rect.top) / rect.height) * 100;
      }
      pushUndo();
      spawnCone(pctX, pctY);
      saveCones(); autoSaveFrame();
    });

    // --- Select mode toggle ---
    const selectToolBtn = document.getElementById('tb-select-tool');
    if (selectToolBtn) {
      selectToolBtn.addEventListener('click', () => {
        const wasActive = selectMode;
        deactivateDrawTools();
        if (!wasActive) {
          selectMode = true;
          selectToolBtn.classList.add('tb-select-tool-active');
          inner.style.cursor = 'default';
        } else {
          clearSelection();
        }
      });
    }

    // Attach drag to existing circles
    inner.querySelectorAll('.tb-circle').forEach(c => {
      makeDraggable(c);
      c.querySelector('.tb-num').addEventListener('input', saveState);
    });

    // Name input
    if (nameInput) nameInput.addEventListener('input', saveState);

    // Color pickers
    document.getElementById('tb-team-color')?.addEventListener('input', updateCircleColors);
    document.getElementById('tb-opp-color')?.addEventListener('input', updateCircleColors);

    // Opponent toggle
    const showOppCheck = document.getElementById('tb-show-opp');
    const oppColorPick = document.getElementById('tb-opp-color');
    showOppCheck?.addEventListener('change', () => {
      localStorage.setItem('fa_tactic_show_opp', showOppCheck.checked);
      if (oppColorPick) oppColorPick.style.display = showOppCheck.checked ? '' : 'none';
      if (showOppCheck.checked) {
        spawnOppCircles();
      } else {
        inner.querySelectorAll('.tb-circle-opp').forEach(c => c.remove());
        localStorage.removeItem('fa_tactic_opp_positions');
        localStorage.removeItem('fa_tactic_opp_numbers');
      }
    });

    // Custom formation dropdown
    const toggle = document.getElementById('tb-formation-toggle');
    const list = document.getElementById('tb-formation-list');
    if (toggle && list) {
      toggle.addEventListener('click', () => list.classList.toggle('open'));
      document.addEventListener('click', e => {
        if (!e.target.closest('#tb-formation-wrap')) list.classList.remove('open');
      });
      list.querySelectorAll('.tb-formation-option').forEach(opt => {
        opt.addEventListener('click', () => {
          const f = opt.dataset.val;
          toggle.textContent = f || '— Select —';
          list.querySelectorAll('.tb-formation-option').forEach(o => o.classList.remove('active'));
          opt.classList.add('active');
          list.classList.remove('open');
          localStorage.setItem('fa_tactic_formation', f);
          if (f && formations[f]) {
            localStorage.removeItem('fa_tactic_positions');
            localStorage.removeItem('fa_tactic_numbers');
            localStorage.removeItem('fa_tactic_opp_positions');
            localStorage.removeItem('fa_tactic_opp_numbers');
            spawnCircles(adaptFormation(formations[f]), null);
            if (document.getElementById('tb-show-opp')?.checked) spawnOppCircles();
          } else {
            inner.querySelectorAll('.tb-circle').forEach(c => c.remove());
            localStorage.removeItem('fa_tactic_positions');
            localStorage.removeItem('fa_tactic_numbers');
            localStorage.removeItem('fa_tactic_formation');
            localStorage.removeItem('fa_tactic_opp_positions');
            localStorage.removeItem('fa_tactic_opp_numbers');
          }
        });
      });
    }

    // Orientation toggle
    const orientBtn = document.getElementById('tb-orient');
    if (orientBtn) {
      orientBtn.addEventListener('click', () => {
        orientBtn.classList.add('tb-spinning');
        const cur = isVertical() ? 'horizontal' : 'vertical';
        localStorage.setItem('fa_tactic_orient', cur);
        setTimeout(() => { navigate('tactics'); }, 300);
      });
    }

    // --- Silhouette picker ---
    const silBtn = document.getElementById('tb-sil-btn');
    const silMenu = document.getElementById('tb-sil-menu');
    const silImg = document.getElementById('tb-silhouette');
    if (silImg) {
      silImg.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        showCtxMenu(e.clientX, e.clientY, [{
          label: 'Remove silhouette', danger: true,
          action: () => {
            silImg.src = ''; silImg.style.display = 'none';
            localStorage.setItem('fa_tactic_silhouette', '');
            if (silMenu) silMenu.querySelectorAll('.tb-sil-opt').forEach(o => o.classList.toggle('tb-sil-active', !o.dataset.sil));
            autoSaveFrame();
          }
        }]);
      });
    }
    if (silBtn && silMenu) {
      silBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        silMenu.classList.toggle('tb-sil-menu-open');
      });
      document.addEventListener('click', () => silMenu.classList.remove('tb-sil-menu-open'), { once: false });
      silMenu.addEventListener('click', (e) => e.stopPropagation());
      silMenu.querySelectorAll('.tb-sil-opt').forEach(opt => {
        opt.addEventListener('click', () => {
          const val = opt.dataset.sil || '';
          localStorage.setItem('fa_tactic_silhouette', val);
          silMenu.querySelectorAll('.tb-sil-opt').forEach(o => o.classList.remove('tb-sil-active'));
          opt.classList.add('tb-sil-active');
          silMenu.classList.remove('tb-sil-menu-open');
          const silImg = document.getElementById('tb-silhouette');
          if (silImg) {
            if (val) { silImg.src = 'img/sil-' + val + '.png'; silImg.style.display = 'block'; }
            else { silImg.src = ''; silImg.style.display = 'none'; }
          }
          autoSaveFrame();
        });
      });
    }

    // --- Save / Load / Delete boards ---
    function hasUnsavedChanges() {
      return hasTacticUnsavedChanges();
    }

    function refreshSavedList() {
      const listEl = document.getElementById('tb-saved-list');
      if (!listEl) return;
      const boards = getSavedBoards();
      listEl.innerHTML = tbSavedListHtml(boards,
        localStorage.getItem('fa_tactic_loaded_id'));
      bindTacticsSavedList();
    }

    bindTacticsSavedList();

    // Bind styled tooltips for toolbar controls
    (function bindToolbarTooltips() {
      let tooltipEl = document.getElementById('roster-tooltip');
      if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'roster-tooltip';
        tooltipEl.className = 'roster-tooltip';
        document.body.appendChild(tooltipEl);
      }
      document.querySelectorAll('.tb-controls [data-tooltip]').forEach(el => {
        el.addEventListener('mouseenter', () => {
          tooltipEl.textContent = el.getAttribute('data-tooltip');
          tooltipEl.classList.add('visible');
          // Both axes are viewport coordinates — .roster-tooltip is
          // position:fixed, so no window.scrollY. They used to disagree:
          // left came from the viewport, top was pushed into document space.
          const r = el.getBoundingClientRect();
          tooltipEl.style.left = r.left + r.width / 2 - tooltipEl.offsetWidth / 2 + 'px';
          tooltipEl.style.top = r.top - tooltipEl.offsetHeight - 10 + 'px';
        });
        el.addEventListener('mouseleave', () => {
          tooltipEl.classList.remove('visible');
        });
      });
    })();

    // Save button (overwrites loaded board, or creates new if nothing loaded)
    const saveBtn = document.getElementById('tb-save');
    saveBtn?.addEventListener('click', () => {
      const f = localStorage.getItem('fa_tactic_formation') || '';
      saveState();
      if (typeof autoSaveFrame === 'function') autoSaveFrame();
      const pos = JSON.parse(localStorage.getItem('fa_tactic_positions') || 'null');
      const nums = JSON.parse(localStorage.getItem('fa_tactic_numbers') || 'null');
      const bt = localStorage.getItem('fa_tactic_board_type') || 'full';
      const name = (nameInput ? nameInput.value : '').trim() || 'Board';
      const boards = getSavedBoards();
      const loadedId = localStorage.getItem('fa_tactic_loaded_id');
      const loadedPos = loadedId ? boards.findIndex(b => b.id === loadedId) : -1;
      // Stamped, not derived: a saved board is attached to no player, match
      // or date, so there is nothing to join on. It belongs to whichever
      // category the coach authored it under.
      const entry = { id: loadedPos !== -1 ? loadedId : ('tb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
        category: getCurrentCategory(), name, formation: f, positions: pos, numbers: nums, boardType: bt,
        teamColor: localStorage.getItem('fa_tactic_team_color') || '#ffffff',
        oppColor: localStorage.getItem('fa_tactic_opp_color') || '#e53935',
        showOpp: localStorage.getItem('fa_tactic_show_opp') === 'true',
        oppPositions: JSON.parse(localStorage.getItem('fa_tactic_opp_positions') || 'null'),
        oppNumbers: JSON.parse(localStorage.getItem('fa_tactic_opp_numbers') || 'null'),
        balls: JSON.parse(localStorage.getItem('fa_tactic_balls') || '[]'),
        colors: JSON.parse(localStorage.getItem('fa_tactic_colors') || 'null'),
        arrows: JSON.parse(localStorage.getItem('fa_tactic_arrows') || '[]'),
        rects: JSON.parse(localStorage.getItem('fa_tactic_rects') || '[]'),
        texts: JSON.parse(localStorage.getItem('fa_tactic_texts') || '[]'),
        penLines: JSON.parse(localStorage.getItem('fa_tactic_pen_lines') || '[]'),
        frames: JSON.parse(localStorage.getItem('fa_tactic_frames') || '[]'),
        tag: localStorage.getItem('fa_tactic_tag') || '',
        silhouette: localStorage.getItem('fa_tactic_silhouette') || '',
        cones: JSON.parse(localStorage.getItem('fa_tactic_cones') || '[]')
      };

      if (loadedPos !== -1) {
        // Overwrite — check duplicate name (excluding self)
        const dup = boards.some(b => b.id !== loadedId && b.name.toLowerCase() === name.toLowerCase());
        if (dup) { alert(t('alert.board_name_exists')); return; }
        boards[loadedPos] = entry;
      } else {
        // New save — check duplicate name
        const dup = boards.some(b => b.name.toLowerCase() === name.toLowerCase());
        if (dup) { alert(t('alert.board_name_exists')); return; }
        boards.push(entry);
        localStorage.setItem('fa_tactic_loaded_id', entry.id);
      }
      localStorage.setItem('fa_tactic_saved', JSON.stringify(boards));
      // Also update any linked match boards with the same name
      const matchBoards = JSON.parse(localStorage.getItem('fa_tactic_match_boards') || '{}');
      let mbChanged = false;
      for (const mid of Object.keys(matchBoards)) {
        const arr = matchBoards[mid];
        for (let j = 0; j < arr.length; j++) {
          if (arr[j].name === entry.name) {
            arr[j] = entry;
            mbChanged = true;
          }
        }
      }
      if (mbChanged) localStorage.setItem('fa_tactic_match_boards', JSON.stringify(matchBoards));
      // Also update any linked training boards with the same name
      const trainingBoards = JSON.parse(localStorage.getItem('fa_tactic_training_boards') || '{}');
      let tbChanged = false;
      for (const tdate of Object.keys(trainingBoards)) {
        const arr = trainingBoards[tdate];
        for (let j = 0; j < arr.length; j++) {
          if (arr[j].name === entry.name) {
            arr[j] = entry;
            tbChanged = true;
          }
        }
      }
      if (tbChanged) localStorage.setItem('fa_tactic_training_boards', JSON.stringify(trainingBoards));
      refreshSavedList();
      // Visual feedback
      if (saveBtn) {
        const orig = saveBtn.textContent;
        saveBtn.textContent = t('tb.saved');
        saveBtn.style.background = '#2e7d32';
        setTimeout(() => { saveBtn.textContent = orig; saveBtn.style.background = ''; }, 1200);
      }
    });

    // Save As button
    document.getElementById('tb-save-as')?.addEventListener('click', () => {
      const f = localStorage.getItem('fa_tactic_formation') || '';
      saveState();
      if (typeof autoSaveFrame === 'function') autoSaveFrame();
      const pos = JSON.parse(localStorage.getItem('fa_tactic_positions') || 'null');
      const nums = JSON.parse(localStorage.getItem('fa_tactic_numbers') || 'null');
      const suggested = (nameInput ? nameInput.value : '').trim() || 'Board';
      const name = prompt('Board name:', suggested);
      if (!name) return;
      const boards = getSavedBoards();
      const bt = localStorage.getItem('fa_tactic_board_type') || 'full';
      const dup = boards.some(b => b.name.toLowerCase() === name.trim().toLowerCase());
      if (dup) { alert(t('alert.board_name_exists')); return; }
      const newId = 'tb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      // Same stamp as the Save path above — see the comment there.
      boards.push({ id: newId, category: getCurrentCategory(), name: name.trim(), formation: f, positions: pos, numbers: nums, boardType: bt,
        teamColor: localStorage.getItem('fa_tactic_team_color') || '#ffffff',
        oppColor: localStorage.getItem('fa_tactic_opp_color') || '#e53935',
        showOpp: localStorage.getItem('fa_tactic_show_opp') === 'true',
        oppPositions: JSON.parse(localStorage.getItem('fa_tactic_opp_positions') || 'null'),
        oppNumbers: JSON.parse(localStorage.getItem('fa_tactic_opp_numbers') || 'null'),
        balls: JSON.parse(localStorage.getItem('fa_tactic_balls') || '[]'),
        colors: JSON.parse(localStorage.getItem('fa_tactic_colors') || 'null'),
        arrows: JSON.parse(localStorage.getItem('fa_tactic_arrows') || '[]'),
        rects: JSON.parse(localStorage.getItem('fa_tactic_rects') || '[]'),
        texts: JSON.parse(localStorage.getItem('fa_tactic_texts') || '[]'),
        penLines: JSON.parse(localStorage.getItem('fa_tactic_pen_lines') || '[]'),
        frames: JSON.parse(localStorage.getItem('fa_tactic_frames') || '[]'),
        tag: localStorage.getItem('fa_tactic_tag') || '',
        silhouette: localStorage.getItem('fa_tactic_silhouette') || '',
        cones: JSON.parse(localStorage.getItem('fa_tactic_cones') || '[]')
      });
      localStorage.setItem('fa_tactic_saved', JSON.stringify(boards));
      localStorage.setItem('fa_tactic_loaded_id', newId);
      if (nameInput) { nameInput.value = name.trim(); localStorage.setItem('fa_tactic_name', name.trim()); }
      refreshSavedList();
    });

    // New Board button
    document.getElementById('tb-new-board')?.addEventListener('click', () => {
      const doNew = () => {
        localStorage.removeItem('fa_tactic_formation');
        localStorage.removeItem('fa_tactic_positions');
        localStorage.removeItem('fa_tactic_numbers');
        localStorage.removeItem('fa_tactic_colors');
        localStorage.removeItem('fa_tactic_name');
        localStorage.removeItem('fa_tactic_loaded_id');
        localStorage.removeItem('fa_tactic_board_type');
        localStorage.removeItem('fa_tactic_opp_positions');
        localStorage.removeItem('fa_tactic_opp_numbers');
        localStorage.removeItem('fa_tactic_show_opp');
        localStorage.removeItem('fa_tactic_balls');
        localStorage.removeItem('fa_tactic_arrows');
        localStorage.removeItem('fa_tactic_rects');
        localStorage.removeItem('fa_tactic_texts');
        localStorage.removeItem('fa_tactic_pen_lines');
        localStorage.removeItem('fa_tactic_frames');
        localStorage.removeItem('fa_tactic_frame_idx');
        localStorage.removeItem('fa_tactic_tag');
        localStorage.removeItem('fa_tactic_silhouette');
        localStorage.removeItem('fa_tactic_cones');
        navigate('tactics');
      };
      if (hasUnsavedChanges()) {
        showTbConfirm(t('tb.new_title'), t('tb.new_msg'), doNew);
      } else {
        doNew();
      }
    });

    // --- Tag ---
    const tagToggle = document.getElementById('tb-tag-toggle');
    const tagList = document.getElementById('tb-tag-list');
    const tagAddInput = document.getElementById('tb-tag-add-input');
    const tagAddBtn = document.getElementById('tb-tag-add-btn');
    const DEFAULT_TAGS = ['Presión', 'Salida', 'Estrategia'];
    function getTagList() {
      const custom = JSON.parse(localStorage.getItem('fa_tactic_tags') || '[]');
      // Merge defaults + custom, preserving order: defaults first, then custom
      const all = [...DEFAULT_TAGS];
      custom.forEach(t => { if (!all.includes(t)) all.push(t); });
      return all;
    }
    function saveTagList(list) {
      // Only persist custom tags (non-defaults)
      localStorage.setItem('fa_tactic_tags', JSON.stringify(list.filter(t => !DEFAULT_TAGS.includes(t))));
    }
    function renderTagList() {
      if (!tagList) return;
      const tags = getTagList();
      const current = localStorage.getItem('fa_tactic_tag') || '';
      let html = '<div class="tb-tag-option' + (!current ? ' active' : '') + '" data-tag=""><span>— None —</span></div>';
      html += tags.map(t => {
        const isDefault = DEFAULT_TAGS.includes(t);
        return '<div class="tb-tag-option' + (t === current ? ' active' : '') + '" data-tag="' + sanitize(t) + '">' +
          '<span>' + sanitize(t) + '</span>' +
          (isDefault ? '' : '<button class="tb-tag-option-del" data-del-tag="' + sanitize(t) + '" title="Remove tag">✕</button>') +
        '</div>';
      }).join('');
      tagList.innerHTML = html;
      tagList.querySelectorAll('.tb-tag-option').forEach(opt => {
        opt.addEventListener('click', e => {
          if (e.target.closest('.tb-tag-option-del')) return;
          const val = opt.dataset.tag;
          localStorage.setItem('fa_tactic_tag', val);
          tagToggle.textContent = val || '— None —';
          tagToggle.classList.toggle('has-tag', !!val);
          tagList.classList.remove('open');
          renderTagList();
        });
      });
      tagList.querySelectorAll('.tb-tag-option-del').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const del = btn.dataset.delTag;
          const list = getTagList().filter(t => t !== del);
          saveTagList(list);
          if ((localStorage.getItem('fa_tactic_tag') || '') === del) {
            localStorage.setItem('fa_tactic_tag', '');
            tagToggle.textContent = '— None —';
            tagToggle.classList.remove('has-tag');
          }
          renderTagList();
        });
      });
    }
    if (tagToggle && tagList) {
      tagToggle.addEventListener('click', () => {
        renderTagList();
        tagList.classList.toggle('open');
      });
      document.addEventListener('click', e => {
        if (!e.target.closest('#tb-tag-select-wrap')) tagList.classList.remove('open');
      });
    }
    if (tagAddBtn && tagAddInput) {
      const doAddTag = () => {
        const val = tagAddInput.value.trim();
        if (!val) return;
        const list = getTagList();
        if (!list.includes(val)) { list.push(val); saveTagList(list); }
        localStorage.setItem('fa_tactic_tag', val);
        tagToggle.textContent = val;
        tagToggle.classList.add('has-tag');
        tagAddInput.value = '';
        renderTagList();
      };
      tagAddBtn.addEventListener('click', doAddTag);
      tagAddInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); doAddTag(); }
      });
    }

    // Add to Match
    function refreshMatchLinked() {
      const el = document.getElementById('tb-match-linked');
      if (!el) return;
      const matchBoards = JSON.parse(localStorage.getItem('fa_tactic_match_boards') || '{}');
      const allMatches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
      const curName = (nameInput ? nameInput.value : localStorage.getItem('fa_tactic_name') || '').trim();
      // Show which matches this board is linked to
      const linked = [];
      for (const [mid, boards] of Object.entries(matchBoards)) {
        if (boards.some(b => b.name === curName)) {
          const m = allMatches.find(x => x.id === Number(mid));
          if (m) {
            const teamLetter = m.team ? ' (' + sanitize(m.team) + ')' : '';
            const home = isOurTeam(m.home) ? getClubName() + teamLetter : sanitize(m.home);
            const away = isOurTeam(m.away) ? getClubName() + teamLetter : sanitize(m.away);
            linked.push({ mid, label: home + ' vs ' + away });
          }
        }
      }
      if (!linked.length) { el.innerHTML = ''; return; }
      el.innerHTML = '<div class="tb-match-linked-title">Linked to:</div>' +
        linked.map(l => `<div class="tb-match-linked-item"><span>${l.label}</span><button class="tb-match-unlink" data-mid="${l.mid}" title="Remove">✕</button></div>`).join('');
      el.querySelectorAll('.tb-match-unlink').forEach(btn => {
        btn.addEventListener('click', () => {
          const mid = btn.dataset.mid;
          const mb = JSON.parse(localStorage.getItem('fa_tactic_match_boards') || '{}');
          if (mb[mid]) {
            mb[mid] = mb[mid].filter(b => b.name !== curName);
            if (!mb[mid].length) delete mb[mid];
            localStorage.setItem('fa_tactic_match_boards', JSON.stringify(mb));
          }
          refreshMatchLinked();
        });
      });
    }
    refreshMatchLinked();

    // Add to Training
    function refreshTrainingLinked() {
      const el = document.getElementById('tb-training-linked');
      if (!el) return;
      const trainingBoards = JSON.parse(localStorage.getItem('fa_tactic_training_boards') || '{}');
      const allTraining = getTrainings();
      const curName = (nameInput ? nameInput.value : localStorage.getItem('fa_tactic_name') || '').trim();
      const linked = [];
      for (const [tdate, boards] of Object.entries(trainingBoards)) {
        if (boards.some(b => b.name === curName)) {
          const t = allTraining.find(x => x.date === tdate);
          const label = t ? (sanitize(t.focus || 'Training') + ' — ' + tDateDayMonth(tdate)) : tdate;
          linked.push({ tdate, label });
        }
      }
      if (!linked.length) { el.innerHTML = ''; return; }
      el.innerHTML = '<div class="tb-match-linked-title">Linked to:</div>' +
        linked.map(l => `<div class="tb-match-linked-item"><span>${l.label}</span><button class="tb-match-unlink" data-tdate="${l.tdate}" title="Remove">✕</button></div>`).join('');
      el.querySelectorAll('.tb-match-unlink').forEach(btn => {
        btn.addEventListener('click', () => {
          const tdate = btn.dataset.tdate;
          const tb = JSON.parse(localStorage.getItem('fa_tactic_training_boards') || '{}');
          if (tb[tdate]) {
            tb[tdate] = tb[tdate].filter(b => b.name !== curName);
            if (!tb[tdate].length) delete tb[tdate];
            localStorage.setItem('fa_tactic_training_boards', JSON.stringify(tb));
          }
          refreshTrainingLinked();
        });
      });
    }
    refreshTrainingLinked();

    // Training dropdown (custom)
    let selectedTrainingVal = '';
    const trainingToggle = document.getElementById('tb-training-toggle');
    const trainingList = document.getElementById('tb-training-list');
    if (trainingToggle && trainingList) {
      trainingToggle.addEventListener('click', () => trainingList.classList.toggle('open'));
      document.addEventListener('click', e => {
        if (!e.target.closest('#tb-training-wrap')) trainingList.classList.remove('open');
      });
      trainingList.querySelectorAll('.tb-match-option').forEach(opt => {
        opt.addEventListener('click', () => {
          selectedTrainingVal = opt.dataset.val || '';
          trainingToggle.textContent = opt.textContent;
          trainingList.querySelectorAll('.tb-match-option').forEach(o => o.classList.remove('active'));
          opt.classList.add('active');
          trainingList.classList.remove('open');
        });
      });
    }

    const addToTrainingBtn = document.getElementById('tb-add-to-training');
    addToTrainingBtn?.addEventListener('click', () => {
      if (!selectedTrainingVal) { alert(t('alert.select_training')); return; }
      const f = localStorage.getItem('fa_tactic_formation') || '';
      saveState();
      if (typeof autoSaveFrame === 'function') autoSaveFrame();
      const pos = JSON.parse(localStorage.getItem('fa_tactic_positions') || 'null');
      const nums = JSON.parse(localStorage.getItem('fa_tactic_numbers') || 'null');
      const bt = localStorage.getItem('fa_tactic_board_type') || 'full';
      const bName = (nameInput ? nameInput.value : '').trim() || 'Board';
      const trainingBoards = JSON.parse(localStorage.getItem('fa_tactic_training_boards') || '{}');
      const tdate = selectedTrainingVal;
      if (!trainingBoards[tdate]) trainingBoards[tdate] = [];
      const idx = trainingBoards[tdate].findIndex(b => b.name === bName);
      // Stamped, not derived: this map is keyed by training DATE, and two
      // categories training the same evening share one bucket — so the date
      // cannot tell us whose board this is. Phase 5 shards on this field.
      const entry = { category: getCurrentCategory(), name: bName, formation: f, positions: pos, numbers: nums, boardType: bt,
        teamColor: localStorage.getItem('fa_tactic_team_color') || '#ffffff',
        oppColor: localStorage.getItem('fa_tactic_opp_color') || '#e53935',
        showOpp: localStorage.getItem('fa_tactic_show_opp') === 'true',
        oppPositions: JSON.parse(localStorage.getItem('fa_tactic_opp_positions') || 'null'),
        oppNumbers: JSON.parse(localStorage.getItem('fa_tactic_opp_numbers') || 'null'),
        balls: JSON.parse(localStorage.getItem('fa_tactic_balls') || '[]'),
        colors: JSON.parse(localStorage.getItem('fa_tactic_colors') || 'null'),
        arrows: JSON.parse(localStorage.getItem('fa_tactic_arrows') || '[]'),
        rects: JSON.parse(localStorage.getItem('fa_tactic_rects') || '[]'),
        texts: JSON.parse(localStorage.getItem('fa_tactic_texts') || '[]'),
        penLines: JSON.parse(localStorage.getItem('fa_tactic_pen_lines') || '[]'),
        frames: JSON.parse(localStorage.getItem('fa_tactic_frames') || '[]'),
        tag: localStorage.getItem('fa_tactic_tag') || '',
        silhouette: localStorage.getItem('fa_tactic_silhouette') || '',
        cones: JSON.parse(localStorage.getItem('fa_tactic_cones') || '[]')
      };
      if (idx !== -1) trainingBoards[tdate][idx] = entry;
      else trainingBoards[tdate].push(entry);
      localStorage.setItem('fa_tactic_training_boards', JSON.stringify(trainingBoards));
      const orig = addToTrainingBtn.textContent;
      addToTrainingBtn.textContent = t('tb.added');
      addToTrainingBtn.style.background = '#2e7d32';
      setTimeout(() => { addToTrainingBtn.textContent = orig; addToTrainingBtn.style.background = ''; }, 1200);
      refreshTrainingLinked();
    });

    // Match dropdown (custom)
    let selectedMatchVal = '';
    const matchToggle = document.getElementById('tb-match-toggle');
    const matchList = document.getElementById('tb-match-list');
    if (matchToggle && matchList) {
      matchToggle.addEventListener('click', () => matchList.classList.toggle('open'));
      document.addEventListener('click', e => {
        if (!e.target.closest('#tb-match-wrap')) matchList.classList.remove('open');
      });
      matchList.querySelectorAll('.tb-match-option').forEach(opt => {
        opt.addEventListener('click', () => {
          selectedMatchVal = opt.dataset.val || '';
          matchToggle.textContent = opt.textContent;
          matchList.querySelectorAll('.tb-match-option').forEach(o => o.classList.remove('active'));
          opt.classList.add('active');
          matchList.classList.remove('open');
        });
      });
    }

    const addToMatchBtn = document.getElementById('tb-add-to-match');
    addToMatchBtn?.addEventListener('click', () => {
      if (!selectedMatchVal) { alert(t('alert.select_match')); return; }
      const f = localStorage.getItem('fa_tactic_formation') || '';
      saveState();
      if (typeof autoSaveFrame === 'function') autoSaveFrame();
      const pos = JSON.parse(localStorage.getItem('fa_tactic_positions') || 'null');
      const nums = JSON.parse(localStorage.getItem('fa_tactic_numbers') || 'null');
      const bt = localStorage.getItem('fa_tactic_board_type') || 'full';
      const bName = (nameInput ? nameInput.value : '').trim() || 'Board';
      const matchBoards = JSON.parse(localStorage.getItem('fa_tactic_match_boards') || '{}');
      const mid = selectedMatchVal;
      if (!matchBoards[mid]) matchBoards[mid] = [];
      // Replace if same name already linked to this match, otherwise add
      const idx = matchBoards[mid].findIndex(b => b.name === bName);
      const entry = { name: bName, formation: f, positions: pos, numbers: nums, boardType: bt,
        teamColor: localStorage.getItem('fa_tactic_team_color') || '#ffffff',
        oppColor: localStorage.getItem('fa_tactic_opp_color') || '#e53935',
        showOpp: localStorage.getItem('fa_tactic_show_opp') === 'true',
        oppPositions: JSON.parse(localStorage.getItem('fa_tactic_opp_positions') || 'null'),
        oppNumbers: JSON.parse(localStorage.getItem('fa_tactic_opp_numbers') || 'null'),
        balls: JSON.parse(localStorage.getItem('fa_tactic_balls') || '[]'),
        colors: JSON.parse(localStorage.getItem('fa_tactic_colors') || 'null'),
        arrows: JSON.parse(localStorage.getItem('fa_tactic_arrows') || '[]'),
        rects: JSON.parse(localStorage.getItem('fa_tactic_rects') || '[]'),
        texts: JSON.parse(localStorage.getItem('fa_tactic_texts') || '[]'),
        penLines: JSON.parse(localStorage.getItem('fa_tactic_pen_lines') || '[]'),
        frames: JSON.parse(localStorage.getItem('fa_tactic_frames') || '[]'),
        tag: localStorage.getItem('fa_tactic_tag') || '',
        silhouette: localStorage.getItem('fa_tactic_silhouette') || '',
        cones: JSON.parse(localStorage.getItem('fa_tactic_cones') || '[]')
      };
      if (idx !== -1) matchBoards[mid][idx] = entry;
      else matchBoards[mid].push(entry);
      localStorage.setItem('fa_tactic_match_boards', JSON.stringify(matchBoards));
      // Visual feedback
      const orig = addToMatchBtn.textContent;
      addToMatchBtn.textContent = t('tb.added');
      addToMatchBtn.style.background = '#2e7d32';
      setTimeout(() => { addToMatchBtn.textContent = orig; addToMatchBtn.style.background = ''; }, 1200);
      refreshMatchLinked();
    });

    // ===== Frames (animation keyframes) =====
    let frames = JSON.parse(localStorage.getItem('fa_tactic_frames') || '[]');
    let activeFrameIdx = frames.length ? Math.min(Number(localStorage.getItem('fa_tactic_frame_idx') || 0), frames.length - 1) : -1;
    let framePlaying = false;

    function syncNumbersAcrossFrames() {
      const nums = JSON.parse(localStorage.getItem('fa_tactic_numbers') || '[]');
      const oppNums = JSON.parse(localStorage.getItem('fa_tactic_opp_numbers') || '[]');
      frames.forEach(f => {
        if (f.numbers) f.numbers = JSON.parse(JSON.stringify(nums));
        if (f.oppNumbers) f.oppNumbers = JSON.parse(JSON.stringify(oppNums));
      });
      saveFrames();
    }

    function syncColorsAcrossFrames() {
      const clrs = JSON.parse(localStorage.getItem('fa_tactic_colors') || '[]');
      frames.forEach(f => {
        f.colors = JSON.parse(JSON.stringify(clrs));
      });
      saveFrames();
    }

    function captureFrameState() {
      saveState(); saveArrows(); saveRects(); saveTexts(); savePenLines(); saveCones();
      return {
        positions: JSON.parse(localStorage.getItem('fa_tactic_positions') || 'null'),
        numbers: JSON.parse(localStorage.getItem('fa_tactic_numbers') || 'null'),
        colors: JSON.parse(localStorage.getItem('fa_tactic_colors') || 'null'),
        oppPositions: JSON.parse(localStorage.getItem('fa_tactic_opp_positions') || 'null'),
        oppNumbers: JSON.parse(localStorage.getItem('fa_tactic_opp_numbers') || 'null'),
        balls: JSON.parse(localStorage.getItem('fa_tactic_balls') || '[]'),
        arrows: JSON.parse(localStorage.getItem('fa_tactic_arrows') || '[]'),
        rects: JSON.parse(localStorage.getItem('fa_tactic_rects') || '[]'),
        texts: JSON.parse(localStorage.getItem('fa_tactic_texts') || '[]'),
        penLines: JSON.parse(localStorage.getItem('fa_tactic_pen_lines') || '[]'),
        silhouette: localStorage.getItem('fa_tactic_silhouette') || '',
        cones: JSON.parse(localStorage.getItem('fa_tactic_cones') || '[]'),
        duration: 1000
      };
    }

    function applyFrameState(f) {
      // Merge numbers: for each index, prefer non-empty from either current or frame
      const currentNumbers = JSON.parse(localStorage.getItem('fa_tactic_numbers') || '[]');
      const currentOppNumbers = JSON.parse(localStorage.getItem('fa_tactic_opp_numbers') || '[]');
      const fNums = f.numbers || [];
      const fOppNums = f.oppNumbers || [];
      const mergedNums = [];
      const maxNumLen = Math.max(currentNumbers.length, fNums.length);
      for (let i = 0; i < maxNumLen; i++) {
        mergedNums[i] = currentNumbers[i] || fNums[i] || '';
      }
      const mergedOppNums = [];
      const maxOppNumLen = Math.max(currentOppNumbers.length, fOppNums.length);
      for (let i = 0; i < maxOppNumLen; i++) {
        mergedOppNums[i] = currentOppNumbers[i] || fOppNums[i] || '';
      }
      // Positions + numbers + colors
      if (f.positions) localStorage.setItem('fa_tactic_positions', JSON.stringify(f.positions));
      localStorage.setItem('fa_tactic_numbers', JSON.stringify(mergedNums));
      // Merge colors: preserve per-circle colors across frames
      const currentColors = JSON.parse(localStorage.getItem('fa_tactic_colors') || '[]');
      const fColors = f.colors || [];
      const mergedColors = [];
      const maxColorLen = Math.max(currentColors.length, fColors.length);
      for (let i = 0; i < maxColorLen; i++) {
        mergedColors[i] = currentColors[i] || fColors[i] || '';
      }
      localStorage.setItem('fa_tactic_colors', JSON.stringify(mergedColors));
      if (f.oppPositions) localStorage.setItem('fa_tactic_opp_positions', JSON.stringify(f.oppPositions));
      else localStorage.removeItem('fa_tactic_opp_positions');
      localStorage.setItem('fa_tactic_opp_numbers', JSON.stringify(mergedOppNums));
      localStorage.setItem('fa_tactic_balls', JSON.stringify(f.balls || []));
      localStorage.setItem('fa_tactic_arrows', JSON.stringify(f.arrows || []));
      localStorage.setItem('fa_tactic_rects', JSON.stringify(f.rects || []));
      localStorage.setItem('fa_tactic_texts', JSON.stringify(f.texts || []));
      localStorage.setItem('fa_tactic_pen_lines', JSON.stringify(f.penLines || []));

      // Use merged numbers and colors for display
      const numsToUse = mergedNums;
      const oppNumsToUse = mergedOppNums;

      // Rebuild circles (skip null entries = deleted circles)
      const teamColor = document.getElementById('tb-team-color')?.value || '#ffffff';
      const clrs = mergedColors;
      inner.querySelectorAll('.tb-circle:not(.tb-circle-opp)').forEach(c => c.remove());
      (f.positions || []).forEach((p, i) => {
          if (!p) return; // null = deleted circle slot
          const d = toDisplay(p[0], p[1]);
          const num = (numsToUse && numsToUse[i]) || '';
          const isGk = String(num) === '1';
          const bg = isGk ? GK_COLOR : (clrs[i] || teamColor);
          const div = document.createElement('div');
          div.className = 'tb-circle';
          div.dataset.idx = i;
          if (clrs[i]) div.dataset.color = clrs[i];
          div.style.left = d[0] + '%'; div.style.top = d[1] + '%';
          div.style.background = bg; div.style.borderColor = darkenHex(bg, 50);
          const inp = document.createElement('input');
          inp.className = 'tb-num'; inp.maxLength = 2;
          inp.value = (numsToUse && numsToUse[i]) || '';
          inp.style.color = textColorFor(bg);
          inp.addEventListener('input', () => { saveState(); syncNumbersAcrossFrames(); autoSaveFrame(); });
          div.appendChild(inp);
          makeDraggable(div);
          inner.appendChild(div);
        });
      // Rebuild opp circles (skip null entries)
      inner.querySelectorAll('.tb-circle-opp').forEach(c => c.remove());
      const oc = document.getElementById('tb-opp-color')?.value || '#e53935';
      const obc = darkenHex(oc, 50);
      (f.oppPositions || []).forEach((p, i) => {
          if (!p) return; // null = deleted circle slot
          const d = toDisplay(p[0], p[1]);
          const num = (oppNumsToUse && oppNumsToUse[i]) || '';
          const isGk = String(num) === '1';
          const oppBg = isGk ? GK_COLOR : oc;
          const div = document.createElement('div');
          div.className = 'tb-circle tb-circle-opp';
          div.dataset.idx = i;
          div.style.left = d[0] + '%'; div.style.top = d[1] + '%';
          div.style.background = oppBg; div.style.borderColor = darkenHex(oppBg, 50);
          const inp = document.createElement('input');
          inp.className = 'tb-num'; inp.maxLength = 2;
          inp.value = (oppNumsToUse && oppNumsToUse[i]) || '';
          inp.style.color = textColorFor(oc);
          inp.addEventListener('input', () => { saveState(); syncNumbersAcrossFrames(); autoSaveFrame(); });
          div.appendChild(inp);
          makeDraggable(div);
          inner.appendChild(div);
        });
      // Balls
      inner.querySelectorAll('.tb-ball').forEach(b => b.remove());
      (f.balls || []).forEach((b, i) => {
        if (!b) return; // null = deleted ball
        const bd = toDisplay(b[0], b[1]);
        spawnBall(bd[0], bd[1]);
      });
      // Arrows
      arrowsSvg.querySelectorAll('.tb-arrow').forEach(a => a.remove());
      (f.arrows || []).forEach((a, idx) => {
        const d1 = toDisplay(a[0], a[1]);
        const d2 = toDisplay(a[2], a[3]);
        const col = a[4] || '#ffffff';
        const dashed = a[5];
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.classList.add('tb-arrow');
        line.setAttribute('x1', d1[0] + '%'); line.setAttribute('y1', d1[1] + '%');
        line.setAttribute('x2', d2[0] + '%'); line.setAttribute('y2', d2[1] + '%');
        line.setAttribute('stroke', col);
        line.style.stroke = col;
        line.dataset.color = col;
        line.dataset.idx = idx;
        if (dashed) { line.setAttribute('stroke-dasharray', '4 3'); line.dataset.dash = '1'; }
        arrowsSvg.appendChild(line);
      });
      refreshArrowheads(arrowsSvg);
      // Rects
      arrowsSvg.querySelectorAll('.tb-rect').forEach(r => r.remove());
      const defs = arrowsSvg.querySelector('defs');
      (f.rects || []).forEach((r, idx) => {
        const tl = toDisplay(r[0], r[1]);
        const br = toDisplay(r[0] + r[2], r[1] + r[3]);
        const dx = Math.min(tl[0], br[0]);
        const dy = Math.min(tl[1], br[1]);
        const dw = Math.abs(br[0] - tl[0]);
        const dh = Math.abs(br[1] - tl[1]);
        const col = r[4] || '#ffffff';
        const op = r[5] != null ? r[5] : 0.3;
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.classList.add('tb-rect');
        rect.setAttribute('x', dx + '%'); rect.setAttribute('y', dy + '%');
        rect.setAttribute('width', dw + '%'); rect.setAttribute('height', dh + '%');
        rect.setAttribute('fill', col);
        rect.setAttribute('fill-opacity', op);
        rect.setAttribute('stroke', col);
        rect.dataset.color = col; rect.dataset.opacity = op; rect.dataset.idx = idx;
        defs.insertAdjacentElement('afterend', rect);
      });
      // Text labels
      inner.querySelectorAll('.tb-text-label').forEach(el => el.remove());
      (f.texts || []).forEach((t, idx) => {
        const d = toDisplay(t[0], t[1]);
        createTextLabel(d[0], d[1], t[2], t[3] || '#000000', t[4] != null ? t[4] : 0.8, t[5] || null, t[6] || null, t[7] || null);
      });
      // Pen lines
      arrowsSvg.querySelectorAll('.tb-pen-line').forEach(p => p.remove());
      (f.penLines || []).forEach(p => spawnPenLine(p[0], p[1], p[2]));
      // Silhouette
      const silVal = f.silhouette || '';
      localStorage.setItem('fa_tactic_silhouette', silVal);
      const silImg = document.getElementById('tb-silhouette');
      if (silImg) {
        if (silVal) { silImg.src = 'img/sil-' + silVal + '.png'; silImg.style.display = 'block'; }
        else { silImg.src = ''; silImg.style.display = 'none'; }
      }
      // Update picker active state
      document.querySelectorAll('.tb-sil-opt').forEach(o => o.classList.toggle('tb-sil-active', (o.dataset.sil || '') === silVal));
      // Cones
      localStorage.setItem('fa_tactic_cones', JSON.stringify(f.cones || []));
      inner.querySelectorAll('.tb-cone').forEach(c => c.remove());
      (f.cones || []).forEach(c => spawnCone(c[0], c[1]));
      clearSelection();
    }

    function saveFrames() {
      localStorage.setItem('fa_tactic_frames', JSON.stringify(frames));
      localStorage.setItem('fa_tactic_frame_idx', activeFrameIdx);
    }

    function autoSaveFrame() {
      if (activeFrameIdx >= 0 && activeFrameIdx < frames.length && !framePlaying) {
        const existingDur = frames[activeFrameIdx].duration || 1000;
        frames[activeFrameIdx] = captureFrameState();
        frames[activeFrameIdx].duration = existingDur;
        saveFrames();
      }
    }

    function renderFrameStrip() {
      const strip = document.getElementById('tb-frames-strip');
      if (!strip) return;
      let html = '';
      frames.forEach((f, i) => {
        if (i > 0) {
          html += `<div class="tb-frame-gap">` +
            `<input class="tb-frame-dur" type="text" inputmode="decimal" value="${((f.duration || 1000) / 1000).toFixed(1)}s" data-frame-idx="${i}" title="Transition time (s)">` +
            `</div>`;
        }
        html += `<div class="tb-frame-item${i === activeFrameIdx ? ' tb-frame-active' : ''}" data-frame-idx="${i}">` +
          `<button class="tb-frame-del" data-del-idx="${i}" title="Delete frame">✕</button>` +
          `<div class="tb-frame-thumb" data-frame-idx="${i}">${i + 1}</div>` +
          `</div>`;
      });
      html += `<button class="tb-frame-add" id="tb-frame-add" title="Add frame">+</button>`;
      strip.innerHTML = html;
      // Re-bind
      strip.querySelector('#tb-frame-add')?.addEventListener('click', addFrame);
      strip.querySelectorAll('.tb-frame-thumb').forEach(th => {
        th.addEventListener('click', () => {
          const idx = Number(th.dataset.frameIdx);
          if (idx === activeFrameIdx) return;
          activeFrameIdx = idx;
          applyFrameState(frames[idx]);
          saveFrames();
          renderFrameStrip();
        });
      });
      strip.querySelectorAll('.tb-frame-del').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const idx = Number(btn.dataset.delIdx);
          frames.splice(idx, 1);
          if (frames.length === 0) { activeFrameIdx = -1; }
          else if (activeFrameIdx >= frames.length) { activeFrameIdx = frames.length - 1; applyFrameState(frames[activeFrameIdx]); }
          else if (idx === activeFrameIdx) { activeFrameIdx = Math.min(idx, frames.length - 1); applyFrameState(frames[activeFrameIdx]); }
          else if (idx < activeFrameIdx) { activeFrameIdx--; }
          saveFrames();
          renderFrameStrip();
        });
      });
      strip.querySelectorAll('.tb-frame-dur').forEach(inp => {
        inp.addEventListener('change', () => {
          const idx = Number(inp.dataset.frameIdx);
          if (frames[idx]) {
            const num = parseFloat(inp.value.replace(/s$/i, '')) || 1;
            frames[idx].duration = Math.max(100, Math.round(num * 1000));
            inp.value = (frames[idx].duration / 1000).toFixed(1) + 's';
            saveFrames();
          }
        });
      });
    }

    function addFrame() {
      autoSaveFrame();
      // Duplicate the last frame (regardless of which frame is selected)
      const lastFrame = frames.length > 0 ? JSON.parse(JSON.stringify(frames[frames.length - 1])) : captureFrameState();
      lastFrame.duration = 1000;
      frames.push(lastFrame);
      activeFrameIdx = frames.length - 1;
      applyFrameState(lastFrame);
      saveFrames();
      renderFrameStrip();
    }

    // Play animation: interpolates positions between frames
    const playBtn = document.getElementById('tb-frame-play');
    playBtn?.addEventListener('click', () => {
      if (framePlaying) { framePlaying = false; playBtn.classList.remove('playing'); return; }
      if (frames.length < 2) return;
      autoSaveFrame();
      framePlaying = true;
      playBtn.classList.add('playing');
      deactivateDrawTools();
      clearSelection();
      let fIdx = 0;
      applyFrameState(frames[0]);
      activeFrameIdx = 0;
      renderFrameStrip();

      function playNext() {
        if (!framePlaying || fIdx >= frames.length - 1) {
          applyFrameState(frames[0]);
          refreshArrowheads(arrowsSvg);
          activeFrameIdx = 0;
          renderFrameStrip();
          framePlaying = false;
          playBtn.classList.remove('playing');
          return;
        }
        const from = frames[fIdx];
        const to = frames[fIdx + 1];
        const dur = to.duration || 1000;
        const startT = performance.now();

        function animate(now) {
          if (!framePlaying) { applyFrameState(frames[0]); refreshArrowheads(arrowsSvg); activeFrameIdx = 0; renderFrameStrip(); playBtn.classList.remove('playing'); return; }
          const t = Math.min((now - startT) / dur, 1);
          interpolateAndApply(from, to, t);
          if (t < 1) {
            requestAnimationFrame(animate);
          } else {
            fIdx++;
            activeFrameIdx = fIdx;
            applyFrameState(frames[fIdx]);
            refreshArrowheads(arrowsSvg);
            renderFrameStrip();
            if (fIdx < frames.length - 1) {
              setTimeout(playNext, 0);
            } else {
              setTimeout(() => {
                applyFrameState(frames[0]);
                refreshArrowheads(arrowsSvg);
                activeFrameIdx = 0;
                renderFrameStrip();
                framePlaying = false;
                playBtn.classList.remove('playing');
              }, 1000);
            }
          }
        }
        requestAnimationFrame(animate);
      }
      setTimeout(playNext, 200);
    });
    function lerp(a, b, t) { return a + (b - a) * t; }

    function interpolateAndApply(from, to, t) {
      const teamColor = document.getElementById('tb-team-color')?.value || '#ffffff';
      const oppColor = document.getElementById('tb-opp-color')?.value || '#e53935';
      const currentNumbers = JSON.parse(localStorage.getItem('fa_tactic_numbers') || '[]');
      const currentOppNumbers = JSON.parse(localStorage.getItem('fa_tactic_opp_numbers') || '[]');
      const currentColors = JSON.parse(localStorage.getItem('fa_tactic_colors') || '[]');

      // --- Team circles: match by stable array index ---
      const fromPos = from.positions || [];
      const toPos = to.positions || [];
      const maxLen = Math.max(fromPos.length, toPos.length);

      // Build a map of existing DOM circles by dataset.idx
      let circleMap = {};
      inner.querySelectorAll('.tb-circle:not(.tb-circle-opp)').forEach(c => {
        circleMap[Number(c.dataset.idx)] = c;
      });

      // Merge colors: prefer current (synced) over frame-local
      const fClrs = to.colors || [];
      const clrs = [];
      const maxClrLen = Math.max(currentColors.length, fClrs.length);
      for (let ci = 0; ci < maxClrLen; ci++) {
        clrs[ci] = currentColors[ci] || fClrs[ci] || '';
      }
      for (let i = 0; i < maxLen; i++) {
        const fP = fromPos[i]; // from-frame position (or null if deleted/absent)
        const tP = toPos[i];   // to-frame position (or null if deleted/absent)
        const circle = circleMap[i];

        if (!tP) {
          // Circle deleted in target frame — remove from DOM
          if (circle) { circle.remove(); delete circleMap[i]; }
          continue;
        }

        if (!circle) {
          // Circle new in target frame — create at target position
          const num = currentNumbers[i] || '';
          const isGk = String(num) === '1';
          const bg = isGk ? GK_COLOR : (clrs[i] || teamColor);
          const d = toDisplay(tP[0], tP[1]);
          const div = document.createElement('div');
          div.className = 'tb-circle';
          div.dataset.idx = i;
          if (clrs[i]) div.dataset.color = clrs[i];
          div.style.left = d[0] + '%'; div.style.top = d[1] + '%';
          div.style.background = bg; div.style.borderColor = darkenHex(bg, 50);
          const inp = document.createElement('input');
          inp.className = 'tb-num'; inp.maxLength = 2;
          inp.value = num;
          inp.style.color = textColorFor(bg);
          div.appendChild(inp);
          inner.appendChild(div);
          circleMap[i] = div;
          continue;
        }

        // Circle exists in both frames — interpolate position
        if (fP && tP) {
          const hL = lerp(fP[0], tP[0], t);
          const hT = lerp(fP[1], tP[1], t);
          const d = toDisplay(hL, hT);
          circle.style.left = d[0] + '%'; circle.style.top = d[1] + '%';
        } else if (!fP && tP) {
          // Snap: circle new in target frame, already in DOM from prior tick
          const d = toDisplay(tP[0], tP[1]);
          circle.style.left = d[0] + '%'; circle.style.top = d[1] + '%';
        }
      }

      // --- Opp circles: same stable-index matching ---
      const fromOpp = from.oppPositions || [];
      const toOpp = to.oppPositions || [];
      const maxOppLen = Math.max(fromOpp.length, toOpp.length);

      let oppMap = {};
      inner.querySelectorAll('.tb-circle-opp').forEach(c => {
        oppMap[Number(c.dataset.idx)] = c;
      });

      for (let i = 0; i < maxOppLen; i++) {
        const fP = fromOpp[i];
        const tP = toOpp[i];
        const circle = oppMap[i];

        if (!tP) {
          if (circle) { circle.remove(); delete oppMap[i]; }
          continue;
        }

        if (!circle) {
          const num = currentOppNumbers[i] || '';
          const isGk = String(num) === '1';
          const oppBg = isGk ? GK_COLOR : oppColor;
          const d = toDisplay(tP[0], tP[1]);
          const div = document.createElement('div');
          div.className = 'tb-circle tb-circle-opp';
          div.dataset.idx = i;
          div.style.left = d[0] + '%'; div.style.top = d[1] + '%';
          div.style.background = oppBg; div.style.borderColor = darkenHex(oppBg, 50);
          const inp = document.createElement('input');
          inp.className = 'tb-num'; inp.maxLength = 2;
          inp.value = num;
          inp.style.color = textColorFor(oppBg);
          div.appendChild(inp);
          inner.appendChild(div);
          oppMap[i] = div;
          continue;
        }

        if (fP && tP) {
          const hL = lerp(fP[0], tP[0], t);
          const hT = lerp(fP[1], tP[1], t);
          const d = toDisplay(hL, hT);
          circle.style.left = d[0] + '%'; circle.style.top = d[1] + '%';
        } else if (!fP && tP) {
          const d = toDisplay(tP[0], tP[1]);
          circle.style.left = d[0] + '%'; circle.style.top = d[1] + '%';
        }
      }

      // Balls
      const fromBalls = from.balls || [];
      const toBalls = to.balls || [];
      const maxBalls = Math.max(fromBalls.length, toBalls.length);
      let ballMap = {};
      inner.querySelectorAll('.tb-ball').forEach(b => { ballMap[Number(b.dataset.idx || 0)] = b; });
      for (let bi = 0; bi < maxBalls; bi++) {
        const fB = fromBalls[bi];
        const tB = toBalls[bi];
        let ball = ballMap[bi];
        if (!tB) { if (ball) { ball.remove(); } continue; }
        if (!ball) {
          const d = toDisplay(tB[0], tB[1]);
          ball = document.createElement('div');
          ball.className = 'tb-ball'; ball.dataset.idx = bi;
          ball.style.left = d[0] + '%'; ball.style.top = d[1] + '%';
          inner.appendChild(ball);
          continue;
        }
        if (fB && tB) {
          const bL = lerp(fB[0], tB[0], t);
          const bT = lerp(fB[1], tB[1], t);
          const bd = toDisplay(bL, bT);
          ball.style.left = bd[0] + '%'; ball.style.top = bd[1] + '%';
        } else if (!fB && tB) {
          const d = toDisplay(tB[0], tB[1]);
          ball.style.left = d[0] + '%'; ball.style.top = d[1] + '%';
        }
      }
      // Arrows — snap to target frame at t=0
      const tArr = to.arrows || [];
      const curArrows = arrowsSvg.querySelectorAll('.tb-arrow');
      const arrKey = tArr.map(a => a.join(',')).join('|');
      const curArrKey = Array.from(curArrows).map(a => [a.getAttribute('x1'),a.getAttribute('y1'),a.getAttribute('x2'),a.getAttribute('y2'),a.dataset.color||'',a.dataset.dash||''].join(',')).join('|');
      if (arrKey !== curArrKey) {
        curArrows.forEach(a => a.remove());
        tArr.forEach((a, idx) => {
          const d1 = toDisplay(a[0], a[1]);
          const d2 = toDisplay(a[2], a[3]);
          const col = a[4] || '#ffffff';
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.classList.add('tb-arrow');
          line.setAttribute('x1', d1[0] + '%'); line.setAttribute('y1', d1[1] + '%');
          line.setAttribute('x2', d2[0] + '%'); line.setAttribute('y2', d2[1] + '%');
          line.setAttribute('stroke', col);
          line.style.stroke = col;
          line.dataset.color = col; line.dataset.idx = idx;
          if (a[5]) { line.setAttribute('stroke-dasharray', '4 3'); line.dataset.dash = '1'; }
          arrowsSvg.appendChild(line);
        });
        refreshArrowheads(arrowsSvg);
      }
      // Rects — snap to target frame at t=0
      const tRects = to.rects || [];
      const curRects = arrowsSvg.querySelectorAll('.tb-rect');
      const recKey = tRects.map(r => r.join(',')).join('|');
      const curRecKey = Array.from(curRects).map(r => [r.getAttribute('x'),r.getAttribute('y'),r.getAttribute('width'),r.getAttribute('height'),r.dataset.color||'',r.dataset.opacity||''].join(',')).join('|');
      if (recKey !== curRecKey) {
        curRects.forEach(r => r.remove());
        const defs = arrowsSvg.querySelector('defs');
        tRects.forEach((r, idx) => {
          const tl = toDisplay(r[0], r[1]);
          const br = toDisplay(r[0] + r[2], r[1] + r[3]);
          const dx = Math.min(tl[0], br[0]), dy = Math.min(tl[1], br[1]);
          const dw = Math.abs(br[0] - tl[0]), dh = Math.abs(br[1] - tl[1]);
          const col = r[4] || '#ffffff';
          const op = r[5] != null ? r[5] : 0.3;
          const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          rect.classList.add('tb-rect');
          rect.setAttribute('x', dx + '%'); rect.setAttribute('y', dy + '%');
          rect.setAttribute('width', dw + '%'); rect.setAttribute('height', dh + '%');
          rect.setAttribute('fill', col); rect.setAttribute('fill-opacity', op);
          rect.setAttribute('stroke', col);
          rect.dataset.color = col; rect.dataset.opacity = op; rect.dataset.idx = idx;
          if (defs) defs.insertAdjacentElement('afterend', rect);
          else arrowsSvg.appendChild(rect);
        });
      }
      // Pen lines — snap to target frame at t=0
      const tPen = to.penLines || [];
      const curPen = arrowsSvg.querySelectorAll('.tb-pen-line');
      const penKey = tPen.map(p => p[0]).join('|');
      const curKey = Array.from(curPen).map(p => p.getAttribute('points')).join('|');
      if (penKey !== curKey) {
        curPen.forEach(p => p.remove());
        tPen.forEach(p => {
          const pl = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
          pl.setAttribute('class', 'tb-pen-line');
          pl.setAttribute('points', p[0]);
          pl.style.cssText = 'pointer-events:none;fill:none;stroke:' + (p[1]||'#ffffff') + ';stroke-width:2.5;vector-effect:non-scaling-stroke;';
          if (p[2]) pl.setAttribute('stroke-dasharray', '6 4');
          arrowsSvg.appendChild(pl);
        });
      }
      // Cones — snap to target frame at t=0
      const tCones = to.cones || [];
      const curCones = inner.querySelectorAll('.tb-cone');
      const coneKey = tCones.map(c => c[0] + ',' + c[1]).join('|');
      const curConeKey = Array.from(curCones).map(c => parseFloat(c.style.left) + ',' + parseFloat(c.style.top)).join('|');
      if (coneKey !== curConeKey) {
        curCones.forEach(c => c.remove());
        tCones.forEach(c => spawnCone(c[0], c[1]));
      }
    }

    // Patch makeDraggable's pointerup and SVG drag to auto-save frames
    inner.addEventListener('pointerup', () => { if (activeFrameIdx >= 0) setTimeout(autoSaveFrame, 50); }, true);
    arrowsSvg.addEventListener('pointerup', () => { if (activeFrameIdx >= 0) setTimeout(autoSaveFrame, 80); }, true);

    // Init
    renderFrameStrip();
    // Compute polygon arrowheads after layout is ready
    requestAnimationFrame(() => refreshArrowheads(arrowsSvg));
    // Update arrowheads on resize
    let _ahResizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(_ahResizeTimer);
      _ahResizeTimer = setTimeout(() => {
        refreshArrowheads(arrowsSvg);
        document.querySelectorAll('.tb-field-readonly .tb-arrows-svg').forEach(svg => refreshArrowheads(svg));
      }, 150);
    });
  }

  // TACTIC_FORMATIONS → utils.js

  function hasTacticUnsavedChanges() {
    const curFormation = localStorage.getItem('fa_tactic_formation') || '';
    const curPositions = JSON.parse(localStorage.getItem('fa_tactic_positions') || 'null');
    const curNumbers = JSON.parse(localStorage.getItem('fa_tactic_numbers') || 'null');
    const curName = localStorage.getItem('fa_tactic_name') || '';
    if (!curFormation) return false;
    const loadedId = localStorage.getItem('fa_tactic_loaded_id');
    if (loadedId === null) {
      if (curName) return true;
      if (curNumbers && curNumbers.some(n => n && n !== '')) return true;
      if (curPositions && TACTIC_FORMATIONS[curFormation]) {
        const def = TACTIC_FORMATIONS[curFormation];
        for (let i = 0; i < curPositions.length; i++) {
          if (Math.round(curPositions[i][0]*100) !== Math.round(def[i][0]*100) ||
              Math.round(curPositions[i][1]*100) !== Math.round(def[i][1]*100)) return true;
        }
      }
      return false;
    }
    const saved = JSON.parse(localStorage.getItem('fa_tactic_saved') || '[]');
    const board = saved.find(b => b.id === loadedId);
    if (!board) return true;
    if (curFormation !== board.formation) return true;
    if (curName !== (board.name || '')) return true;
    if (JSON.stringify(curPositions) !== JSON.stringify(board.positions)) return true;
    if (JSON.stringify(curNumbers) !== JSON.stringify(board.numbers)) return true;
    return false;
  }

  /* Saved boards are addressed by a stable id, never by array position.
     Position was doubly fragile: the index lived in the DOM *and* was
     persisted in fa_tactic_loaded_id across renders, and deleting a board
     had to renumber it by hand. Once Phase 5 merges several category
     documents into this array, a remote change reorders it and a persisted
     index silently points at somebody else's board. */
  function ensureBoardIds(boards) {
    let changed = false;
    boards.forEach(function (b) {
      if (!b.id) {
        b.id = 'tb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        changed = true;
      }
    });
    return changed;
  }

  /** The saved-boards list markup — rendered from four different places. */
  function tbSavedListHtml(boards, loadedId) {
    return boards.map(function (b, i) {
      return '<div class="tb-saved-item' + (loadedId && loadedId === b.id ? ' tb-saved-active' : '') +
        '" data-board-id="' + sanitize(b.id) + '">' +
        '<span>' + sanitize(b.name || 'Board ' + (i + 1)) + '</span>' +
        '<button class="tb-delete-board" data-del-id="' + sanitize(b.id) + '">✕</button>' +
        '</div>';
    }).join('');
  }

  /** Read the saved boards, backfilling ids for anything saved before them. */
  function getSavedBoards() {
    const boards = JSON.parse(localStorage.getItem('fa_tactic_saved') || '[]');
    if (ensureBoardIds(boards)) {
      localStorage.setItem('fa_tactic_saved', JSON.stringify(boards));
    }
    return boards;
  }

  function bindTacticsSavedList() {
    document.querySelectorAll('.tb-saved-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.tb-delete-board')) return;
        const boards = getSavedBoards();
        const board = boards.find(b => b.id === item.dataset.boardId);
        if (!board) return;
        const doLoad = () => {
          localStorage.setItem('fa_tactic_formation', board.formation || '');
          localStorage.setItem('fa_tactic_positions', JSON.stringify(board.positions));
          localStorage.setItem('fa_tactic_numbers', JSON.stringify(board.numbers));
          localStorage.setItem('fa_tactic_name', board.name || '');
          localStorage.setItem('fa_tactic_board_type', board.boardType || 'full');
          localStorage.setItem('fa_tactic_loaded_id', board.id);
          localStorage.setItem('fa_tactic_team_color', board.teamColor || '#ffffff');
          localStorage.setItem('fa_tactic_opp_color', board.oppColor || '#e53935');
          localStorage.setItem('fa_tactic_show_opp', board.showOpp ? 'true' : 'false');
          if (board.oppPositions) localStorage.setItem('fa_tactic_opp_positions', JSON.stringify(board.oppPositions));
          else localStorage.removeItem('fa_tactic_opp_positions');
          if (board.oppNumbers) localStorage.setItem('fa_tactic_opp_numbers', JSON.stringify(board.oppNumbers));
          else localStorage.removeItem('fa_tactic_opp_numbers');
          const _boardBalls = board.balls || (board.ballPos ? [board.ballPos] : []);
          localStorage.setItem('fa_tactic_balls', JSON.stringify(_boardBalls));
          if (board.colors) localStorage.setItem('fa_tactic_colors', JSON.stringify(board.colors));
          else localStorage.removeItem('fa_tactic_colors');
          if (board.arrows && board.arrows.length) localStorage.setItem('fa_tactic_arrows', JSON.stringify(board.arrows));
          else localStorage.removeItem('fa_tactic_arrows');
          if (board.rects && board.rects.length) localStorage.setItem('fa_tactic_rects', JSON.stringify(board.rects));
          else localStorage.removeItem('fa_tactic_rects');
          if (board.texts && board.texts.length) localStorage.setItem('fa_tactic_texts', JSON.stringify(board.texts));
          else localStorage.removeItem('fa_tactic_texts');
          if (board.penLines && board.penLines.length) localStorage.setItem('fa_tactic_pen_lines', JSON.stringify(board.penLines));
          else localStorage.removeItem('fa_tactic_pen_lines');
          if (board.frames && board.frames.length) localStorage.setItem('fa_tactic_frames', JSON.stringify(board.frames));
          else localStorage.removeItem('fa_tactic_frames');
          if (board.tag) localStorage.setItem('fa_tactic_tag', board.tag);
          else localStorage.removeItem('fa_tactic_tag');
          if (board.silhouette) localStorage.setItem('fa_tactic_silhouette', board.silhouette);
          else localStorage.removeItem('fa_tactic_silhouette');
          if (board.cones && board.cones.length) localStorage.setItem('fa_tactic_cones', JSON.stringify(board.cones));
          else localStorage.removeItem('fa_tactic_cones');
          localStorage.removeItem('fa_tactic_frame_idx');
          navigate('tactics');
        };
        if (hasTacticUnsavedChanges()) {
          showTbConfirm(t('tb.load_title'), t('tb.load_msg'), doLoad);
        } else {
          doLoad();
        }
      });
    });
    document.querySelectorAll('.tb-delete-board').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const delId = btn.dataset.delId;
        showTbConfirm(t('tb.delete_title'), t('tb.delete_msg'), () => {
          const boards = getSavedBoards();
          const pos = boards.findIndex(b => b.id === delId);
          if (pos === -1) return;
          const deletedName = boards[pos].name;
          boards.splice(pos, 1);
          localStorage.setItem('fa_tactic_saved', JSON.stringify(boards));
          // Also remove from match-linked boards
          if (deletedName) {
            const mb = JSON.parse(localStorage.getItem('fa_tactic_match_boards') || '{}');
            let mbChanged = false;
            for (const mid of Object.keys(mb)) {
              const before = mb[mid].length;
              mb[mid] = mb[mid].filter(b => b.name !== deletedName);
              if (mb[mid].length !== before) mbChanged = true;
              if (!mb[mid].length) { delete mb[mid]; mbChanged = true; }
            }
            if (mbChanged) localStorage.setItem('fa_tactic_match_boards', JSON.stringify(mb));
          }
          // No renumbering: with ids, deleting a board cannot invalidate the
          // selection of a different one.
          if (localStorage.getItem('fa_tactic_loaded_id') === delId) {
            localStorage.removeItem('fa_tactic_loaded_id');
          }
          const listEl = document.getElementById('tb-saved-list');
          if (listEl) {
            listEl.innerHTML = tbSavedListHtml(boards,
              localStorage.getItem('fa_tactic_loaded_id'));
            bindTacticsSavedList();
          }
        });
      });
    });
  }

  function showTbConfirm(title, message, onConfirm) {
    const existing = document.querySelector('.tb-confirm-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.className = 'tb-confirm-overlay';
    overlay.innerHTML = `<div class="tb-confirm-card">
      <div class="tb-confirm-title">${sanitize(title)}</div>
      <p class="tb-confirm-msg">${sanitize(message)}</p>
      <div class="tb-confirm-actions">
        <button class="btn btn-small btn-outline" id="tbc-cancel">Cancel</button>
        <button class="btn btn-small btn-primary" id="tbc-yes">Yes, continue</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));
    const close = () => { overlay.classList.remove('visible'); setTimeout(() => overlay.remove(), 200); };
    overlay.querySelector('#tbc-cancel').addEventListener('click', close);
    overlay.querySelector('#tbc-yes').addEventListener('click', () => { close(); onConfirm(); });
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  }

  // #endregion Tactical Board Editor

  // #region Training & Staff Views
  // ----- Shared pages -----
  function renderTraining() {
    /* Only the sessions this player is actually called to. This used to read
       the WHOLE club's calendar with no filter at all -- a juvenil player's
       page listed amateur sessions and let him answer availability for them
       -- and it is the same helper that makes a guest see the session he was
       borrowed for. Narrowing and the new feature are one change. */
    var training = playerTrainings(getSession(), getTrainings());
    let rows = training.map(t => {
      const dateStr = t.date ? tDateDMY(t.date) : '—';
      const assistanceCell = (t.status === 'past' && t.assistance != null)
        ? buildAssistanceCircle(t.assistance)
        : '<span style="color:var(--text-secondary)">—</span>';
      return `<tr>
        <td><strong>${t.date ? tDay(new Date(t.date + 'T12:00:00').getDay()) : sanitize(t.day)}</strong></td><td>${dateStr}</td><td>${sanitize(t.time)}</td><td>${sanitize(t.focus)}</td><td>${sanitize(t.location)}</td><td class="center-cell">${assistanceCell}</td>
      </tr>`;
    }).join('');
    return `
      <h2 class="page-title">${t('page.training')}</h2>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>${t('training.th_day')}</th><th>${t('training.th_date')}</th><th>${t('training.th_time')}</th><th>${t('training.th_focus')}</th><th>${t('training.th_location')}</th><th class="center-cell">${t('training.th_assistance')}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>`;
  }

  function renderStaffTraining() {
    // Sessions are addressed by a stable id, never by array position. Position
    // was fragile even locally (a filtered row index written into the full
    // blob), and once Phase 5 merges several category documents into this list
    // a remote change to ANOTHER category can reorder it between render and
    // keystroke — silently writing one squad's edits onto another's session.
    // getTrainings() does the id repair for every surface, not just this one.
    var allTraining = getTrainings();
    allTraining.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    localStorage.setItem('fa_training', JSON.stringify(allTraining));
    var curCat = getCurrentCategory();
    var training = allTraining.filter(function (t) {
      if (curCat && t.category && t.category !== curCat) return false;
      return !trainingTeamFilter || trainingTeams(t).indexOf(trainingTeamFilter) !== -1;
    });
    const DEFAULT_LOC = 'Escola Industrial';
    const DEFAULT_MAP = 'https://share.google/pfbMOc661aRSNlynk';

    function computeStatus(tr) {
      if (!tr.date || !tr.time) return { label: t('training.upcoming'), cls: 'badge-green', key: 'upcoming' };
      const start = new Date(tr.date + 'T' + tr.time.split(' - ')[0] + ':00');
      const now = new Date();
      const endWindow = new Date(start.getTime() + 2 * 60 * 60 * 1000);
      if (now >= endWindow) return { label: t('training.completed'), cls: 'badge-grey', key: 'completed' };
      if (now >= start) return { label: t('training.in_progress'), cls: 'badge-yellow', key: 'inprogress' };
      return { label: t('training.upcoming'), cls: 'badge-green', key: 'upcoming' };
    }

    function fmtDate(dateStr) {
      if (!dateStr) return '';
      const [y, m, d] = dateStr.split('-');
      return d + '/' + m + '/' + y;
    }

    let rows = training.map((tr) => {
      // data-tid is the session's stable id — see the note in the header.
      const i = tr.id;
      const dayName = tr.date ? tDay(new Date(tr.date + 'T12:00:00').getDay()) : (tr.day || '\u2014');
      const locVal = tr.location || DEFAULT_LOC;
      const linkVal = tr.mapLink || (locVal === DEFAULT_LOC ? DEFAULT_MAP : '');
      const st = computeStatus(tr);
      const locked = st.key !== 'upcoming';
      const dis = locked ? ' disabled' : '';
      const assistanceCell = tr.date
        ? buildAvailDonut(tr.date, tr)
        : '<span style="color:var(--text-secondary)">\u2014</span>';
      if (locked) {
        return `<tr data-tid="${i}" class="st-locked">
      <td style="white-space:nowrap">
        <span>${fmtDate(tr.date)}</span>
        <span class="st-day-label">${sanitize(dayName)}</span>
      </td>
      <td>${sanitize(tr.time || '\u2014')}</td>
      <td>${sanitize(tr.focus || '\u2014')}</td>
      <td>${sanitize(locVal)}</td>
      <td>${linkVal ? '<a href="' + sanitize(linkVal) + '" target="_blank" rel="noopener" class="detail-map-link">\ud83d\udccd</a>' : '\u2014'}</td>
      <td class="center-cell"><span class="badge ${st.cls}">${st.label}</span></td>
      <td class="center-cell">${assistanceCell}</td>
      <td></td>
    </tr>`;
      }
      const dmyVal = tr.date ? fmtDate(tr.date) : '';
      return `<tr data-tid="${i}">
      <td style="white-space:nowrap">
        <input type="text" class="reg-input st-date md-datepicker" data-display-dmy data-idx="${i}" data-date-iso="${sanitize(tr.date || '')}" value="${sanitize(dmyVal)}" placeholder="dd/mm/yyyy" readonly style="width:135px;cursor:pointer;">
        <span class="st-day-label">${sanitize(dayName)}</span>
      </td>
      <td><select class="reg-input st-time" data-idx="${i}" style="width:95px;">${buildTimeOptions((tr.time || '').split(' - ')[0])}</select></td>
      <td><input class="reg-input st-focus" data-idx="${i}" value="${sanitize(tr.focus || '')}" placeholder="${t('training.focus_ph')}" style="width:130px;"></td>
      <td><input class="reg-input st-location" data-idx="${i}" value="${sanitize(locVal)}" placeholder="${t('training.location_ph')}" style="width:130px;"></td>
      <td><input class="reg-input st-link" data-idx="${i}" value="${sanitize(linkVal)}" placeholder="${t('training.maplink_ph')}" style="width:160px;"></td>
      <td class="center-cell"><span class="badge ${st.cls}">${st.label}</span></td>
      <td class="center-cell">${assistanceCell}</td>
      <td><button class="md-remove-btn st-remove" data-idx="${i}" title="Remove">&times;</button></td>
    </tr>`;
    }).join('');
    // Overall season attendance donut
    const allPlayers = getUsers().filter(u => (u.roles || []).includes('player'));
    const totalPlayers = allPlayers.length;
    const sessionCount = training.filter(t => t.date).length;
    let seasonYes = 0, seasonLate = 0, seasonNo = 0, seasonInjured = 0, seasonNa = 0;
    const playerAttend = {};
    const playerAbsent = {};
    if (totalPlayers) {
      allPlayers.forEach(p => { playerAttend[p.id] = 0; playerAbsent[p.id] = 0; });
      const _ctxSeason = availContext();
      training.forEach(t => {
        if (!t.date) return;
        const tLocked = isTrainingLocked(t);
        allPlayers.forEach(p => {
          const v = getEffectiveAnswer(p.id, t, tLocked, _ctxSeason);
          if (v === 'yes') { seasonYes++; playerAttend[p.id]++; }
          else if (v === 'late') { seasonLate++; playerAttend[p.id]++; }
          else if (v === 'no') { seasonNo++; playerAbsent[p.id]++; }
          else if (v === 'injured') { seasonInjured++; playerAbsent[p.id]++; }
          else { seasonNa++; }
        });
      });
    }
    const seasonTotal = seasonYes + seasonLate + seasonNo + seasonInjured + seasonNa;
    const seasonAttending = seasonYes + seasonLate;
    let seasonDonutHtml = '';
    if (seasonTotal > 0) {
      const size = 130, stroke = 18, radius = (size - stroke) / 2;
      const circ = 2 * Math.PI * radius;
      const segs = [
        { count: seasonYes, color: '#66bb6a', label: 'Yes' },
        { count: seasonLate, color: '#ffa726', label: 'Late' },
        { count: seasonNo, color: '#78909c', label: 'No' },
        { count: seasonInjured, color: '#ef5350', label: 'Injured' },
        { count: seasonNa, color: '#d0d0d0', label: 'N/A' }
      ];
      let arcs = '', off = 0;
      segs.forEach(s => {
        if (s.count > 0) {
          const len = (s.count / seasonTotal) * circ;
          const sPct = Math.round((s.count / seasonTotal) * 100);
          arcs += `<circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="${s.color}" stroke-width="${stroke}"
            stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-off}"
            style="--circ:${circ};cursor:pointer;pointer-events:stroke" transform="rotate(-90 ${size/2} ${size/2})" data-tooltip="${s.label}: ${sPct}%"><title>${s.label}: ${sPct}%</title></circle>`;
          off += len;
        }
      });
      const pct = Math.round((seasonAttending / seasonTotal) * 100);
      const avgYes = Math.round(seasonYes / sessionCount);
      const avgLate = Math.round(seasonLate / sessionCount);
      const avgNo = Math.round(seasonNo / sessionCount);
      const avgInj = Math.round(seasonInjured / sessionCount);
      const avgNa = Math.round(seasonNa / sessionCount);

      // Top 3 attending / not attending
      const sortedAttend = allPlayers.map(p => ({ name: p.name, count: playerAttend[p.id] || 0 })).sort((a, b) => b.count - a.count).slice(0, 3);
      const sortedAbsent = allPlayers.map(p => ({ name: p.name, count: playerAbsent[p.id] || 0 })).sort((a, b) => b.count - a.count).slice(0, 3);
      const top3AttendHtml = sortedAttend.map((p, i) => `<div class="std-top-row"><span class="std-top-rank">${i + 1}.</span><span class="std-top-name">${sanitize(p.name)}</span><span class="std-top-count" style="color:#66bb6a">${p.count}</span></div>`).join('');
      const top3AbsentHtml = sortedAbsent.map((p, i) => `<div class="std-top-row"><span class="std-top-rank">${i + 1}.</span><span class="std-top-name">${sanitize(p.name)}</span><span class="std-top-count" style="color:#ef5350">${p.count}</span></div>`).join('');

      // Currently injured players
      const availAllData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
      const sortedDates = training.filter(t => t.date).map(t => t.date).sort();
      const injuredPlayers = allPlayers.filter(p => {
        // Find their most recent answer across all training sessions
        for (let d = sortedDates.length - 1; d >= 0; d--) {
          const v = availAllData[p.id + '_' + sortedDates[d]];
          if (v) return v === 'injured';
        }
        return (p.fitnessStatus || 'fit') === 'injured';
      });
      const injuredHtml = injuredPlayers.map(p => {
        const injury = p.injuryNote || 'Injured';
        // Count consecutive weeks injured from most recent backwards
        let weeks = 0;
        for (let d = sortedDates.length - 1; d >= 0; d--) {
          const v = availAllData[p.id + '_' + sortedDates[d]];
          if (v === 'injured') weeks++;
          else if (v) break;
        }
        if (weeks === 0) weeks = 1;
        const weekLabel = weeks === 1 ? t('std.week_1') : weeks + ' ' + t('std.weeks');
        return `<div class="std-top-row"><span class="std-top-name" title="${sanitize(injury)}">${sanitize(p.name)}</span><span class="std-top-count" style="color:#ef5350">${weekLabel}</span></div>`;
      }).join('') || '<div class="std-top-row" style="color:var(--text-secondary)">' + t('std.none') + '</div>';

      seasonDonutHtml = `<div class="card" style="margin-bottom:1.5rem;">
        <div class="card-title">${t('std.season_attendance')}</div>
        <div class="std-donut-wrap">
          <div class="std-donut">
            <svg viewBox="0 0 ${size} ${size}">
              <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="var(--border)" stroke-width="${stroke}"/>
              ${arcs}
            </svg>
            <span class="std-donut-label">${pct}%</span>
          </div>
          <div>
            <div class="std-donut-legend">
              <span class="std-legend-item"><span class="std-legend-dot" style="background:#66bb6a"></span>${t('avail.yes')} (${avgYes})</span>
              <span class="std-legend-item"><span class="std-legend-dot" style="background:#ffa726"></span>${t('avail.late')} (${avgLate})</span>
              <span class="std-legend-item"><span class="std-legend-dot" style="background:#78909c"></span>${t('avail.no')} (${avgNo})</span>
              <span class="std-legend-item"><span class="std-legend-dot" style="background:#ef5350"></span>${t('avail.injured')} (${avgInj})</span>
              ${avgNa ? `<span class="std-legend-item"><span class="std-legend-dot" style="background:#d0d0d0"></span>${t('avail.na')} (${avgNa})</span>` : ''}
            </div>
            <div class="std-season-stat">${t('std.total_sessions')} <strong>${sessionCount}</strong></div>
          </div>
          <div class="std-top-lists">
            <div class="std-top-card">
              <div class="std-top-title">${t('std.top_attendance')}</div>
              ${top3AttendHtml}
            </div>
            <div class="std-top-card">
              <div class="std-top-title">${t('std.most_absent')}</div>
              ${top3AbsentHtml}
            </div>
            <div class="std-top-card">
              <div class="std-top-title">${t('std.currently_injured')}</div>
              <div class="std-top-scroll">${injuredHtml}</div>
            </div>
          </div>
        </div>
      </div>`;
    }

    return `
      <h2 class="page-title">${t('page.training')}</h2>
      ${seasonDonutHtml}
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;gap:.5rem;flex-wrap:wrap;">
          ${(function () {
            // Only worth showing when the category actually has two squads.
            const ls = getTeamLetters(curCat);
            if (ls.length <= 1) return '<span></span>';
            const btn = (val, label) => '<button class="roster-team-btn tr-team-btn' +
              ((trainingTeamFilter === val || (val === 'all' && !trainingTeamFilter)) ? ' roster-team-btn-active' : '') +
              '" data-tr-team="' + val + '">' + label + '</button>';
            return '<div class="roster-team-filter" style="margin-bottom:0;">' +
              btn('all', t('roster.all')) + ls.map(l => btn(l, l)).join('') + '</div>';
          })()}
          <button class="btn btn-outline btn-small matchday-add" id="btn-training-add-top">${t('training.add')}</button>
        </div>
        <div class="table-wrap"><table class="matchday-table">
        <thead><tr><th>${t('training.th_date')}</th><th>${t('training.th_time')}</th><th>${t('training.th_focus')}</th><th>${t('training.th_location')}</th><th>${t('training.th_link')}</th><th class="center-cell">${t('training.th_status')}</th><th class="center-cell">${t('training.th_attendance')}</th><th></th></tr></thead>
        <tbody id="staff-training-body">${rows}</tbody>
      </table></div>
      </div>`;
  }

  function isTrainingLocked(t) {
    if (!t.date || !t.time) return false;
    const start = new Date(t.date + 'T' + t.time.split(' - ')[0] + ':00');
    return new Date() >= new Date(start.getTime() - 60 * 60 * 1000);
  }

  /* Parsed availability blobs, memoised on the RAW STRING.
     getEffectiveAnswer() used to parse both blobs on every single call, and
     it is called once per player per session: the Sessions list ran
     68 rows x 25 players x 2 parses = ~3,400 parses of a 49 KB blob per
     render, which measured at 725 ms before this. Hoisting the parse takes
     it to 1 ms.

     Keyed on the string rather than a render-frame counter on purpose.
     `_renderFrame` only increments in navigate(), not renderPage(), so a
     frame-keyed cache would keep serving the old answers after a player
     taps one — a stale read is worse than a slow one. Any write changes the
     string, so this cannot go stale. */
  let _availRaw = null; let _availParsed = null;
  let _ovrRaw = null; let _ovrParsed = null;

  function availContext() {
    const a = localStorage.getItem('fa_training_availability') || '{}';
    if (a !== _availRaw) { _availRaw = a; _availParsed = JSON.parse(a); }
    const o = localStorage.getItem('fa_training_staff_override') || '{}';
    if (o !== _ovrRaw) { _ovrRaw = o; _ovrParsed = JSON.parse(o); }
    return { availData: _availParsed, overrides: _ovrParsed };
  }

  /** Takes the SESSION, not its date — see recordKey().
   *  `ctx` is optional — pass availContext() in a loop to skip the lookup.
   *  The staff override still wins outright, new format or legacy. */
  function getEffectiveAnswer(playerId, sess, locked, ctx) {
    const c = ctx || availContext();
    const staffVal = readRecord(c.overrides, playerId, sess, 'avail');
    if (staffVal) return staffVal;
    const playerVal = readRecord(c.availData, playerId, sess, 'avail');
    if (playerVal) return playerVal;
    return locked ? 'na' : 'yes';
  }

  function buildDetailDonut(sess, players, locked) {
    const total = players.length;
    if (!total) return '';
    const _ctxDetail = availContext();
    let yes = 0, late = 0, no = 0, injured = 0, na = 0;
    players.forEach(p => {
      const v = getEffectiveAnswer(p.id, sess, locked, _ctxDetail);
      if (v === 'yes') yes++;
      else if (v === 'late') late++;
      else if (v === 'no') no++;
      else if (v === 'injured') injured++;
      else na++;
    });
    const attending = yes + late;
    const size = 100;
    const stroke = 12;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const segments = [
      { count: yes, color: '#66bb6a', label: 'Yes' },
      { count: late, color: '#ffa726', label: 'Late' },
      { count: no, color: '#78909c', label: 'No' },
      { count: injured, color: '#ef5350', label: 'Injured' },
      { count: na, color: '#d0d0d0', label: 'N/A' }
    ];
    let arcs = '';
    let offset = 0;
    segments.forEach(s => {
      if (s.count > 0) {
        const len = (s.count / total) * circumference;
        const sPct = Math.round((s.count / total) * 100);
        arcs += `<circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="${s.color}" stroke-width="${stroke}"
          stroke-dasharray="${len} ${circumference - len}" stroke-dashoffset="${-offset}"
          style="--circ:${circumference};cursor:pointer;pointer-events:stroke" transform="rotate(-90 ${size/2} ${size/2})" data-tooltip="${s.label}: ${sPct}%"><title>${s.label}: ${sPct}%</title></circle>`;
        offset += len;
      }
    });
    return `<div class="std-donut" style="width:${size}px;height:${size}px;">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="var(--border)" stroke-width="${stroke}"/>
        ${arcs}
      </svg>
      <span class="std-donut-label">${attending}/${total}</span>
    </div>
    <div class="std-donut-legend">
      <span class="std-legend-item"><span class="std-legend-dot" style="background:#66bb6a"></span>Yes (${yes})</span>
      <span class="std-legend-item"><span class="std-legend-dot" style="background:#ffa726"></span>Late (${late})</span>
      <span class="std-legend-item"><span class="std-legend-dot" style="background:#78909c"></span>No (${no})</span>
      <span class="std-legend-item"><span class="std-legend-dot" style="background:#ef5350"></span>Injured (${injured})</span>
      ${na ? `<span class="std-legend-item"><span class="std-legend-dot" style="background:#d0d0d0"></span>N/A (${na})</span>` : ''}
    </div>`;
  }

  // ── Auto-generate teams state (ephemeral, not persisted) ──
  let _generatedTeams = null;
  /* Keyed by session id, not date: two squads training the same evening
     would otherwise share one generated set of small-sided teams. */
  let _generatedTeamsId = null;

  // ── Render tactical boards section for staff training detail ──
  /* Takes the session, not just its date. The storage bucket is still
     keyed by date -- two squads share it -- but "have teams been generated"
     is a question about THIS session. */
  function renderStdBoardsSection(sess) {
    const tdate = sess && sess.date;
    const trainingBoards = JSON.parse(localStorage.getItem('fa_tactic_training_boards') || '{}');
    const boards = trainingBoards[tdate] || [];
    if (!boards.length) return '';
    const hasTeams = _generatedTeams && String(_generatedTeamsId) === String(sess && sess.id);
    const tagOrder = ['Presión', 'Salida', 'Estrategia'];
    const grouped = {};
    boards.forEach(b => { const tg = b.tag || ''; if (!grouped[tg]) grouped[tg] = []; grouped[tg].push(b); });
    const orderedTags = [];
    tagOrder.forEach(tg => { if (grouped[tg]) orderedTags.push(tg); });
    Object.keys(grouped).forEach(tg => { if (!orderedTags.includes(tg)) orderedTags.push(tg); });
    return '<div class="card"><div class="card-title">Tactical Boards</div><div class="detail-boards-panel">' +
      orderedTags.map(tag => {
        const tagTitle = tag || 'General';
        return '<div class="detail-board-group"><div class="detail-board-group-title">' + sanitize(tagTitle) + '</div>' +
          grouped[tag].map(b => {
            const boardHtml = renderReadOnlyBoard(b, 'ro-std-');
            let teamsBlock = '';
            if (b.linkedTeams && b.linkedTeams.length) {
              teamsBlock = '<div class="tb-linked-teams">' +
                b.linkedTeams.map((tm, ti) => {
                  const rows = tm.players.map(p => {
                    const posArr = (p.position || '').split(',').map(s => s.trim()).filter(Boolean);
                    const posHtml = posArr.length ? posArr.map(pos => '<span class="pos-circle pos-' + pos + '">' + pos + '</span>').join('') : '';
                    const teamC = p.team ? '<span class="conv-team-circle">' + sanitize(p.team) + '</span>' : '';
                    return '<div class="tb-lt-player">' + posHtml + ' <span>' + sanitize(p.name) + '</span>' + teamC + '</div>';
                  }).join('');
                  return '<div class="tb-lt-team"><div class="tb-lt-team-title">Equip ' + (ti + 1) + ' <span class="tg-team-count">' + tm.players.length + '</span></div>' + rows + '</div>';
                }).join('') +
                '<button class="tb-unlink-teams" data-board-name="' + sanitize(b.name).replace(/"/g, '&quot;') + '" data-tdate="' + tdate + '" title="Remove teams">&times;</button></div>';
            } else if (hasTeams) {
              teamsBlock = '<div class="tb-linked-teams-action"><button class="btn btn-small btn-orange tb-link-teams" data-board-name="' + sanitize(b.name).replace(/"/g, '&quot;') + '" data-tdate="' + tdate + '" data-tsid="' + sanitize(String((sess && sess.id) || '')) + '">📋 Afegir equips</button></div>';
            }
            return boardHtml + teamsBlock;
          }).join('') + '</div>';
      }).join('') + '</div></div>';
  }

  function renderStaffTrainingDetail() {
    const training = getTrainings();
    const tr = training.find(x => String(x.id) === String(detailTrainingId));
    if (!tr) return '<div class="empty-state"><div class="empty-icon">🏋️</div><p>' + t('training.not_found') + '</p></div>';
    /* The squad is now DERIVED from the session -- its teams, plus guests,
       minus exclusions -- instead of "every player in the category".
       This block used to reverse-match the session's day and start time
       against the club's schedules to GUESS which letters shared the slot.
       That guess is gone: the session says who it is for. */
    const calledSquad = calledPlayers(tr, getUsers());
    const players = !stdTeamFilter ? calledSquad
      : calledSquad.filter(p => stdTeamFilter.has(p.team || ''));
    const stdLettersForSlot = trainingTeams(tr);
    const locked = isTrainingLocked(tr);
    const dateFormatted = tr.date ? tDateLong(tr.date) : '—';
    const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
    const overrides = JSON.parse(localStorage.getItem('fa_training_staff_override') || '{}');

    const labels = { yes: t('avail.yes'), late: t('avail.late'), no: t('avail.no'), injured: t('avail.injured'), na: t('avail.na') };
    const cls = { yes: 'avail-yes', late: 'avail-late', no: 'avail-no', injured: 'avail-injured', na: 'avail-na' };
    const allOptions = ['yes', 'late', 'no', 'injured', 'na'];

    const _stdFitCtx = fitnessContext();
    const playerRows = players.map(p => {
      const key = recordKey(p.id, tr, 'avail');
      const playerAnswer = availData[key] || (locked ? 'na' : null);
      const staffAnswer = overrides[key] || null;
      const effective = staffAnswer || playerAnswer;
      const playerLabel = playerAnswer ? labels[playerAnswer] : '—';
      const playerCls = playerAnswer ? cls[playerAnswer] : '';
      const effectiveLabel = effective ? labels[effective] : '—';
      const effectiveCls = effective ? cls[effective] : '';
      const dropdown = allOptions.map(o =>
        `<option value="${o}" ${effective === o ? 'selected' : ''}>${labels[o]}</option>`
      ).join('');
      const teamCircle = p.team ? `<span class="conv-team-circle">${sanitize(p.team)}</span>` : '';

      const derived = deriveFitnessStatus(p.id, false, _stdFitCtx);
      const fStatus = derived.fitnessStatus;
      const injNote = derived.injuryNote || (fStatus === 'doubt' ? 'Doubt' : fStatus === 'injured' ? 'Injury' : '');
      let statusIcon = '';
      if (fStatus === 'fit') statusIcon = '<span class="roster-status-icon roster-status-fit">✓</span>';
      else if (fStatus === 'doubt') statusIcon = `<span class="roster-status-icon roster-status-doubt" data-tooltip="${sanitize(injNote)}">?</span>`;
      else statusIcon = `<span class="roster-status-icon roster-status-injured" data-tooltip="${sanitize(injNote)}">✕</span>`;
      const rd = computeReadiness(p.id);
      const acwrVal = rd.hasData ? (rd.acwr || 0) : 0;
      // Grey, not green, when there is nothing to judge — the same reason
      // the readiness dot changed.
      const acwrColor = !rd.hasData ? 'var(--text-secondary)' : (acwrVal >= 0.8 && acwrVal <= 1.3) ? '#4caf50' : (acwrVal > 1.5 || acwrVal < 0.7) ? '#e53935' : '#ff9800';

      return `<tr>
        <td><span class="conv-pos-circles">${posCirclesHtmlGlobal(p)}</span></td>
        <td><span class="roster-name-wrap">${sanitize(p.name)}${teamCircle}</span></td>
        <td class="center-cell">${statusIcon}</td>
        <td class="center-cell">${readinessCellHtml(rd, fStatus === 'injured')}</td>
        <td class="center-cell" style="font-weight:600;font-size:.82rem;color:${acwrColor}">${rd.hasData ? acwrVal.toFixed(2) : '—'}</td>
        <td class="center-cell"><span class="std-player-answer ${playerCls}">${playerLabel}</span></td>
        <td class="center-cell">
          <select class="std-staff-select ${effectiveCls}" data-player="${p.id}" data-sid="${sanitize(String(tr.id || ''))}">
            ${dropdown}
          </select>
        </td>
      </tr>`;
    }).join('');

    const donutHtml = buildDetailDonut(tr, players, locked);

    // Count present players for default config
    const presentPlayers = players.filter(p => {
      const eff = getEffectiveAnswer(p.id, tr, locked);
      return eff === 'yes' || eff === 'late';
    });
    const presentCount = presentPlayers.length;
    const defaultPerTeam = Math.floor(presentCount / 2) || 1;

    // Render previously generated teams if they exist for this date
    let teamsHtml = '';
    if (_generatedTeams && String(_generatedTeamsId) === String(tr.id)) {
      teamsHtml = renderGeneratedTeams(_generatedTeams, players, tr.date, locked);
    }

    return `
      <button class="btn btn-outline btn-small detail-back" data-back="${backTarget('staff-training')}">${t('btn.back')}</button>
      <div class="detail-hero detail-hero-training">
        <div class="detail-hero-badge"><span class="badge badge-green" style="font-size:.9rem;padding:.3rem .8rem;">${t('training.badge')}</span></div>
        <h2 class="detail-title">${sanitize(tr.focus)}</h2>
        <div class="detail-subtitle">${dateFormatted} · ${sanitize(tr.time || '—')} · ${sanitize(tr.location || '—')}</div>
      </div>
      <div class="card" style="margin-bottom:1.5rem;">
        <div class="card-title">${t('std.attendance_overview')}</div>
        <div class="std-donut-wrap">${donutHtml}</div>
      </div>
      <div class="std-attendance-row">
      <div class="card" style="flex:1;min-width:0;">
        <div class="card-title">${t('std.player_attendance')}</div>
        ${(() => {
          if (stdLettersForSlot.length <= 1) return '';
          const btnAll = !stdTeamFilter ? ' roster-team-btn-active' : '';
          const letterBtns = stdLettersForSlot.map(l => {
            const ac = stdTeamFilter && stdTeamFilter.has(l) ? ' roster-team-btn-active' : '';
            return '<button class="roster-team-btn std-team-btn' + ac + '" data-std-team="' + l + '">' + l + '</button>';
          }).join('');
          return '<div class="roster-team-filter"><button class="roster-team-btn std-team-btn' + btnAll + '" data-std-team="all">All</button>' + letterBtns + '</div>';
        })()}
        <div class="table-wrap"><table class="matchday-table std-attendance-table">
          <thead><tr><th>${t('std.th_pos')}</th><th>${t('std.th_player')}</th><th class="center-cell roster-th-wrap">${t('std.th_status')}</th><th class="center-cell roster-th-wrap">${t('std.th_ready')}</th><th class="center-cell">${t('std.th_ac_ratio')}</th><th class="center-cell">${t('std.th_player_answer')}</th><th class="center-cell">${t('std.th_staff_editable')}</th></tr></thead>
          <tbody>${playerRows}</tbody>
        </table></div>
      </div>
      ${(() => {
        const trainingBoards = JSON.parse(localStorage.getItem('fa_tactic_training_boards') || '{}');
        const boards = trainingBoards[tr.date] || [];
        if (!boards.length) return '';
        const tagOrder = ['Presión', 'Salida', 'Estrategia'];
        const grouped = {};
        boards.forEach(b => { const tg = b.tag || ''; if (!grouped[tg]) grouped[tg] = []; grouped[tg].push(b); });
        const orderedTags = [];
        tagOrder.forEach(tg => { if (grouped[tg]) orderedTags.push(tg); });
        Object.keys(grouped).forEach(tg => { if (!orderedTags.includes(tg)) orderedTags.push(tg); });
        return '<div class="card std-boards-summary"><div class="card-title">' + t('std.planning') + '</div>' +
          orderedTags.map(tag => {
            const tagTitle = tag || 'General';
            return '<div class="std-bs-tag">' + sanitize(tagTitle) + '</div>' +
              '<ul class="std-bs-list">' + grouped[tag].map(b => '<li>' + sanitize(b.name) + '</li>').join('') + '</ul>';
          }).join('') + '</div>';
      })()}
      </div>
      <div class="card">
        <div class="tg-header">
          <div class="card-title" style="margin-bottom:0;">Auto Generate Teams</div>
          <button class="btn btn-outline btn-small" id="btn-tg-toggle">⚙️ Configure</button>
        </div>
        <div class="tg-config-panel" id="tg-config" hidden>
          <div class="tg-config-row">
            <div class="tg-config-field">
              <label>${t('std.num_teams')}</label>
              <input type="number" class="reg-input" id="tg-num-teams" value="2" min="2" max="10" style="width:70px;text-align:center;">
            </div>
            <div class="tg-config-field">
              <label>${t('std.players_per_team')}</label>
              <input type="number" class="reg-input" id="tg-per-team" value="${defaultPerTeam}" min="1" max="20" style="width:70px;text-align:center;">
            </div>
            <div class="tg-config-field">
              <label>${t('std.include_gk')}</label>
              <label class="tg-toggle-label"><input type="checkbox" id="tg-include-gk" checked> <span class="tg-toggle-text">${t('common.yes')}</span></label>
            </div>
            ${(() => {
              // getCurrentCategory(), NOT _currentSession.category: `category`
              // is a player's own squad field and is '' for staff, so a coach
              // resolved to no category and got the fallback letters.
              const tgLetters = getTeamLetters(getCurrentCategory());
              if (tgLetters.length <= 1) return '';   // nothing to filter
              return `<div class="tg-config-field">
              <label>${t('std.team_filter')}</label>
              <div class="tg-btn-group">
                <button class="tg-btn tg-btn-active" data-tg-team="all">${t('common.all')}</button>
                ${tgLetters.map(function(l) {
                  return '<button class="tg-btn" data-tg-team="' + l + '">' + l + '</button>';
                }).join('')}
              </div>
            </div>`;
            })()}
            <div class="tg-config-field">
              <label>${t('std.distribution')}</label>
              <div class="tg-btn-group">
                <button class="tg-btn tg-btn-active" data-tg-mode="mix">${t('std.mix')}</button>
                <button class="tg-btn" data-tg-mode="equal">${t('std.equal')}</button>
              </div>
            </div>
          </div>
          <div style="margin-top:.8rem;text-align:right;">
            <button class="btn btn-primary btn-small" id="btn-tg-generate">${t('std.generate')}</button>
          </div>
        </div>
        <div id="tg-teams-container">${teamsHtml}</div>
      </div>
      ${(() => {
        return '<div id="std-boards-section">' + renderStdBoardsSection(tr) + '</div>';
      })()}`;
  }

  // ── Team generation algorithm ──
  function generateTrainingTeams(allPlayers, sess, locked, numTeams, perTeam, includeGK, teamFilter, mode) {
    // 1. Filter to present players
    let pool = allPlayers.filter(p => {
      const eff = getEffectiveAnswer(p.id, sess, locked);
      return eff === 'yes' || eff === 'late';
    });
    // 2. Apply club team filter
    if (teamFilter && teamFilter !== 'all') pool = pool.filter(p => p.team === teamFilter);
    // 3. Exclude GKs if toggled off
    if (!includeGK) pool = pool.filter(p => {
      const positions = (p.position || '').split(',').map(s => s.trim()).filter(Boolean);
      return !positions.every(pos => pos === 'GK');
    });

    // 4. Categorize by position group.
    //    Keyed off posRankGlobal(), the same ranking the roster and the
    //    convocatòria sort by, rather than positions[0] — a player listed
    //    "ST,CB" used to group as a forward here while sorting as a defender
    //    everywhere else. One player, one position.
    //    POS_ORDER = GK,CB,LB,RB,DM,OM,LW,RW,ST (js/utils.js).
    function posGroup(player) {
      const rank = posRankGlobal(player);
      if (rank === 0) return 'GK';
      if (rank === 1) return 'DEF_CB';
      if (rank <= 3) return 'DEF_WB';
      if (rank === 4) return 'MID_DM';
      if (rank === 5) return 'MID_OM';
      if (rank <= 8) return 'FWD';
      return 'MID_OM'; // no recognised position
    }
    function posCategory(pg) {
      if (pg === 'GK') return 'GK';
      if (pg === 'DEF_CB' || pg === 'DEF_WB') return 'DEF';
      if (pg === 'MID_DM' || pg === 'MID_OM') return 'MID';
      return pg;
    }

    // Shuffle helper
    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    const teams = Array.from({ length: numTeams }, () => []);

    /* Index of the currently smallest team.
       The old code called teams.sort() to find it, which REORDERS the array
       in place — so "Equip 1…N" in renderGeneratedTeams reflected the last
       size-sort rather than a stable identity, and groups appeared to
       shuffle themselves between renders. */
    function smallestTeam() {
      let best = -1;
      for (let i = 0; i < teams.length; i++) {
        // perTeam is a hard cap, so a full group is not a candidate however
        // small it is relative to the others.
        if (teams[i].length >= perTeam) continue;
        if (best === -1 || teams[i].length < teams[best].length) best = i;
      }
      return best;   // -1 when every group is full
    }

    /** Put a player in the emptiest group that still has room. */
    function place(p) {
      const i = smallestTeam();
      if (i !== -1) teams[i].push(p);
    }

    /* Cap the pool BEFORE distributing.
       Trimming afterwards with `while (team.length > perTeam) team.pop()`
       popped the end of a position-ordered list, so the players dropped into
       "No inclosos" were chosen by position rather than fairly — in both
       modes it was reliably the forwards. Cutting a shuffled pool up front
       makes exclusion positionally neutral. */
    const capacity = numTeams * perTeam;
    if (pool.length > capacity) {
      // One keeper per group is reserved before the cut. Capping a plain
      // shuffle can drop every keeper, which trades a positional bias for
      // groups that have nobody in goal.
      const isGK = p => posCategory(posGroup(p)) === 'GK';
      const keepers = shuffle(pool.filter(isGK)).slice(0, numTeams);
      const rest = shuffle(pool.filter(p => keepers.indexOf(p) === -1));
      pool = keepers.concat(rest).slice(0, capacity);
    }

    const gks = shuffle(pool.filter(p => posCategory(posGroup(p)) === 'GK'));
    const outfield = pool.filter(p => posCategory(posGroup(p)) !== 'GK');

    // One keeper per group first, in both modes — however the outfielders are
    // grouped, every group still needs somebody in goal.
    gks.forEach((gk, i) => { if (i < numTeams) teams[i].push(gk); });
    for (let i = numTeams; i < gks.length; i++) place(gks[i]);

    if (mode === 'mix') {
      // MIX — spread each positional bucket across every group, so each group
      // gets a proportional slice of defenders, midfielders and forwards.
      const groups = { DEF: [], MID: [], FWD: [] };
      shuffle(outfield.slice()).forEach(p => {
        const cat = posCategory(posGroup(p));
        (groups[cat] || groups.MID).push(p);
      });
      ['DEF', 'MID', 'FWD'].forEach(g => { groups[g].forEach(place); });
    } else {
      /* EQUAL — group SIMILAR players together: sort by position rank and cut
         into contiguous blocks. With two groups that puts defenders and
         holding midfielders in one, attacking midfielders and forwards in the
         other.

         The old code sorted and then dealt `teams[i % numTeams]`, which
         scatters adjacent (i.e. similar) players into DIFFERENT groups — the
         exact opposite of both its own comment and the intent, and why Equal
         behaved like a second Mix button. */
      const posOrder = { GK: 0, DEF_CB: 1, DEF_WB: 2, MID_DM: 3, MID_OM: 4, FWD: 5 };
      const sorted = outfield.slice().sort((a, b) =>
        (posOrder[posGroup(a)] ?? 3) - (posOrder[posGroup(b)] ?? 3));

      /* Each group takes a CONTIGUOUS slice, sized by what is left to place
         and how many groups are still to fill, and never past `perTeam` —
         the keepers are already seated, so a group holding a spare keeper has
         one slot less for outfielders. Sizing off `sorted.length` alone
         overfilled exactly those groups. */
      let cut = 0;
      for (let i = 0; i < numTeams && cut < sorted.length; i++) {
        const room = Math.max(0, perTeam - teams[i].length);
        const share = Math.ceil((sorted.length - cut) / (numTeams - i));
        const size = Math.min(room, share);
        sorted.slice(cut, cut + size).forEach(p => teams[i].push(p));
        cut += size;
      }
      // Rounding can leave a straggler; give them to any group with room
      // rather than silently dropping a player who was in the pool.
      for (; cut < sorted.length; cut++) {
        if (smallestTeam() === -1) break;
        place(sorted[cut]);
      }
    }

    return teams;
  }

  // ── Render generated teams ──
  function renderGeneratedTeams(teams, allPlayers, sess, locked) {
    // Build set of all assigned player IDs
    const assignedIds = new Set();
    teams.forEach(team => team.forEach(p => assignedIds.add(String(p.id))));
    // Get present but unassigned players for the "+ Jugador" dropdown
    const presentPool = allPlayers.filter(p => {
      const eff = getEffectiveAnswer(p.id, sess, locked);
      return (eff === 'yes' || eff === 'late') && !assignedIds.has(String(p.id));
    });

    const teamCards = teams.map((team, ti) => {
      const playerRows = team.map(p => {
        const teamCircle = p.team ? `<span class="conv-team-circle">${sanitize(p.team)}</span>` : '';
        return `<div class="tg-player-row" draggable="true" data-player-id="${p.id}">
          <span class="conv-pos-circles">${posCirclesHtmlGlobal(p)}</span>
          <span class="tg-player-name"><span class="tg-player-name-text">${sanitize(p.name)}</span>${teamCircle}</span>
          <span class="tg-player-num">#${sanitize(p.playerNumber || '—')}</span>
          <button class="tg-remove-player" data-team-idx="${ti}" data-player-id="${p.id}" title="Remove">&times;</button>
        </div>`;
      }).join('');

      const poolOptions = presentPool.map(p => {
        const tc = p.team ? `<span class="conv-team-circle">${sanitize(p.team)}</span>` : '';
        return `<div class="tg-dd-option" data-pid="${p.id}">
          <span class="conv-pos-circles">${posCirclesHtmlGlobal(p)}</span>
          <span class="tg-player-name"><span class="tg-player-name-text">${sanitize(p.name)}</span>${tc}</span>
          <span class="tg-player-num">${sanitize(p.position || '—')}</span>
        </div>`;
      }).join('');

      return `<div class="tg-team-card" data-team-idx="${ti}">
        <div class="tg-team-title">Equip ${ti + 1} <span class="tg-team-count">${team.length}</span></div>
        <div class="tg-team-players" data-team-idx="${ti}">
          ${playerRows || '<p class="tg-empty-hint">No players</p>'}
        </div>
        <div class="tg-add-wrap">
          <div class="tg-dd" data-team-idx="${ti}">
            <input class="tg-dd-input" placeholder="+ Jugador" autocomplete="off">
            <div class="tg-dd-list" hidden>${poolOptions}</div>
          </div>
        </div>
      </div>`;
    }).join('');

    // "No inclosos" section
    let notIncludedHtml = '';
    if (presentPool.length > 0) {
      const niRows = presentPool.map(p => {
        const teamCircle = p.team ? `<span class="conv-team-circle">${sanitize(p.team)}</span>` : '';
        return `<span class="tg-ni-player" draggable="true" data-player-id="${p.id}">
          <span class="conv-pos-circles">${posCirclesHtmlGlobal(p)}</span>
          <span class="tg-player-name"><span class="tg-player-name-text">${sanitize(p.name)}</span>${teamCircle}</span>
        </span>`;
      }).join('');
      notIncludedHtml = `<div class="tg-not-included">
        <div class="tg-ni-title">No inclosos: <span class="tg-team-count">${presentPool.length}</span></div>
        <div class="tg-ni-list">${niRows}</div>
      </div>`;
    }

    return `<div class="tg-teams-wrap">${teamCards}</div>${notIncludedHtml}`;
  }

  let rosterTeamFilter = 'all';
  let stdTeamFilter = null; // null = all, Set of letters = multi-select
  // Which team's sessions the staff training LIST shows. null = all of them.
  let trainingTeamFilter = null;
  let staffViewPlayerId = null;
  /* ── Staff home ─────────────────────────────────────────────
     The coach's landing page. Deliberately NOT renderWeekActivities():
     that one answers "what do I have on, and have I replied?" for the
     logged-in player — it renders their own availability buttons and
     call-up status, which a coach has no use for. The coach's question is
     the inverse: who has answered, who is fit, who is carrying load.

     Everything here is read-only and links elsewhere; nothing on this page
     writes, so it can be rebuilt on any sync without losing input. */

  /** Fit-for-purpose week list for staff: counts, not personal answers. */
  function renderStaffWeek(weekOffset, players) {
    const { start, end } = getWeekBounds(weekOffset);
    const matches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
    const training = getTrainings();
    const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
    const overrides = JSON.parse(localStorage.getItem('fa_training_staff_override') || '{}');
    const matchAvail = JSON.parse(localStorage.getItem('fa_match_availability') || '{}');
    const sentData = JSON.parse(localStorage.getItem('fa_convocatoria_sent') || '{}');
    const curCat = getCurrentCategory();
    const rows = [];

    training.filter(tr => tr.date >= start && tr.date <= end)
        .filter(tr => !curCat || (tr.category || '') === curCat)
        .forEach(tr => {
          let available = 0; let answered = 0;
          players.forEach(p => {
            const k = recordKey(p.id, tr, 'avail');
            // The staff override wins, exactly as getEffectiveAnswer() has it —
            // but read RAW here: getEffectiveAnswer() assumes 'yes' for an
            // unlocked session, which would report everyone as having replied.
            const v = overrides[k] || availData[k] || '';
            if (!v) return;
            answered++;
            if (v === 'yes' || v === 'late') available++;
          });
          rows.push({
            kind: 'training', date: tr.date, time: tr.time || '',
            label: sanitize(tr.focus || t('activity.badge_training')),
            place: sanitize(tr.location || ''),
            answered, available, total: players.length,
            link: 'staff-training-detail', linkId: tr.id,
          });
        });

    matches.filter(m => m.date >= start && m.date <= end)
        .filter(m => !curCat || (m.category || '') === curCat)
        .forEach(m => {
          const sent = sentData[m.id];
          const called = sent && Array.isArray(sent.players) ? sent.players.length : 0;
          let available = 0; let answered = 0;
          players.forEach(p => {
            const v = matchAvail[p.id + '_' + m.id];
            if (!v) return;
            answered++;
            if (v === 'disponible') available++;
          });
          rows.push({
            kind: 'match', date: m.date, time: m.time || '',
            label: matchLabel(m), place: sanitize(m.location || ''),
            answered, available, total: players.length, called,
            convSent: !!sent, link: 'match-detail', linkId: m.id,
          });
        });

    if (!rows.length) {
      return '<p style="color:var(--text-secondary)">' + t('activity.no_activities') + '</p>';
    }
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

    return rows.map(r => {
      const badge = r.kind === 'match'
        ? '<span class="badge badge-yellow">' + t('activity.badge_match') + '</span>'
        : '<span class="badge badge-green">' + t('activity.badge_training') + '</span>';
      const waiting = r.total - r.answered;
      // Before anyone has replied, "0 available" is technically true and
      // reads as alarming. Show only what is actually known.
      const counts = (r.answered
        ? `<span class="shome-count shome-count-ok">${r.available} ${t('shome.available')}</span>`
        : '') +
        (waiting > 0 ? `<span class="shome-count shome-count-wait">${waiting} ${t('shome.awaiting')}</span>` : '');
      const conv = r.kind === 'match'
        ? (r.convSent
          ? `<span class="shome-tag shome-tag-done">${t('shome.conv_sent')} · ${r.called}</span>`
          : `<span class="shome-tag shome-tag-todo">${t('shome.conv_pending')}</span>`)
        : '';
      return `<div class="shome-row" data-shome-link="${r.link}" data-shome-id="${sanitize(String(r.linkId))}">
        <div class="shome-row-head">${badge}<span class="shome-when">${tDayDDMM(r.date)} · ${sanitize(r.time)}</span>${conv}</div>
        <div class="shome-row-label">${r.label}</div>
        <div class="shome-row-meta">${r.place ? r.place + ' · ' : ''}${counts}</div>
      </div>`;
    }).join('');
  }

  function renderStaffHome(session) {
    const users = getUsers();
    const curCat = getCurrentCategory();
    const players = users.filter(u => (u.roles || []).includes('player'))
        // Same rule the roster uses: an uncategorised player belongs to
        // Registrations, not to somebody else's squad.
        .filter(u => !curCat || (u.category || '') === curCat);

    // ── Out of action ──
    const injuries = JSON.parse(localStorage.getItem('fa_injuries') || '[]');
    const byId = new Map(players.map(p => [String(p.id), p]));
    const today = localDateStr(new Date());
    const inAWeek = localDateStr(new Date(Date.now() + 7 * 86400000));
    const out = injuries
        .filter(i => i.status === 'active' || i.status === 'recovering')
        .filter(i => byId.has(String(i.playerId)))
        .sort((a, b) => (a.expectedReturn || '9999').localeCompare(b.expectedReturn || '9999'));

    const outHtml = out.length ? out.map(i => {
      const p = byId.get(String(i.playerId));
      const ret = i.expectedReturn || '';
      let tag;
      if (!ret) tag = `<span class="shome-tag">${t('shome.no_return_date')}</span>`;
      else if (ret < today) tag = `<span class="shome-tag shome-tag-todo">${t('shome.overdue')} · ${tDayDDMM(ret)}</span>`;
      else if (ret <= inAWeek) tag = `<span class="shome-tag shome-tag-soon">${t('shome.returning_soon')} · ${tDayDDMM(ret)}</span>`;
      else tag = `<span class="shome-tag">${t('shome.expected_return')} · ${tDayDDMM(ret)}</span>`;
      const what = sanitize(i.muscleGroup || '') + (i.muscleSub ? ' (' + sanitize(i.muscleSub) + ')' : '');
      const dot = i.status === 'active' ? 'roster-status-injured' : 'roster-status-doubt';
      return `<div class="shome-row" data-shome-link="medical-detail" data-shome-id="${sanitize(String(i.playerId))}">
        <div class="shome-row-head"><span class="roster-status-icon ${dot}">${i.status === 'active' ? '✕' : '?'}</span>
          <span class="shome-row-label">${sanitize(p.name)}</span>${tag}</div>
        <div class="shome-row-meta">${what}${i.description ? ' – ' + sanitize(i.description) : ''}</div>
      </div>`;
    }).join('') : `<p style="color:var(--text-secondary)">${t('shome.none_out')}</p>`;

    // ── Load watch ──
    // Readiness is load-only and says nothing about injuries, so anyone
    // already listed above is skipped rather than reported twice.
    const outIds = new Set(out.map(i => String(i.playerId)));
    const watch = players
        .filter(p => !outIds.has(String(p.id)))
        .map(p => ({ p, rd: computeReadiness(p.id) }))
        .filter(x => x.rd.hasData && (x.rd.color === 'red' || x.rd.color === 'orange'))
        .sort((a, b) => (a.rd.color === b.rd.color ? a.rd.score - b.rd.score : (a.rd.color === 'red' ? -1 : 1)));

    /* Show only the worst few. The classifier flags orange generously — on
       the demo squad it lights up 16 of 25 — and a list that long is a wall,
       not a warning. The card's badge still carries the true total. */
    const WATCH_LIMIT = 6;
    const watchShown = watch.slice(0, WATCH_LIMIT);
    const watchMore = watch.length - watchShown.length;

    const watchHtml = watch.length ? watchShown.map(({ p, rd }) => `
      <div class="shome-row" data-shome-link="staff-player-stats" data-shome-id="${sanitize(String(p.id))}">
        <div class="shome-row-head">
          <span class="readiness-dot readiness-${rd.color}"></span>
          <span class="shome-row-label">${sanitize(p.name)}</span>
          <span class="shome-score">${rd.score}</span>
        </div>
        <div class="shome-row-meta">${posCirclesHtmlGlobal(p)}</div>
      </div>`).join('') + (watchMore > 0
      ? `<p class="shome-more" data-shome-link="manage-roster" data-shome-id="">+${watchMore} ${t('shome.more')}</p>`
      : '') : `<p style="color:var(--text-secondary)">${t('shome.none_watch')}</p>`;

    /* Low load, listed apart from the risk dot. A high-ACWR player needs
       protecting today; these need building up over weeks. Same card,
       because it is still a load question — but never the same list. */
    const under = players
        .filter(p => !outIds.has(String(p.id)))
        .map(p => ({ p, rd: computeReadiness(p.id) }))
        .filter(x => x.rd.underloaded)
        .sort((a, b) => a.rd.acwr - b.rd.acwr)
        .slice(0, WATCH_LIMIT);

    const underHtml = under.length ? `
      <div class="shome-subhead">${t('shome.underloaded')}
        <span class="shome-badge">${under.length}</span>
        <span class="shome-subhint">${t('shome.underloaded_hint')}</span>
      </div>` + under.map(({ p, rd }) => `
      <div class="shome-row" data-shome-link="staff-player-stats" data-shome-id="${sanitize(String(p.id))}">
        <div class="shome-row-head">
          <span class="readiness-dot readiness-nodata"></span>
          <span class="shome-row-label">${sanitize(p.name)}</span>
          <span class="shome-score">${rd.acwr.toFixed(2)}</span>
        </div>
        <div class="shome-row-meta">${posCirclesHtmlGlobal(p)}</div>
      </div>`).join('') : '';

    return `
      <h2 class="page-title">${t('shome.title')}
        <span style="color:var(--text-secondary);font-weight:600;font-size:.7em;">${players.length} ${t('shome.squad_size')}</span>
      </h2>
      <div class="card">
        <div class="card-title">${t('home.this_week')}</div>
        ${renderStaffWeek(0, players)}
      </div>
      <div class="card">
        <div class="card-title">${t('home.next_week')}</div>
        ${renderStaffWeek(1, players)}
      </div>
      <div class="shome-split">
        <div class="card">
          <div class="card-title">${t('shome.out_of_action')} ${out.length ? '<span class="shome-badge">' + out.length + '</span>' : ''}</div>
          ${outHtml}
        </div>
        <div class="card">
          <div class="card-title">${t('shome.watch_list')} ${watch.length ? '<span class="shome-badge">' + watch.length + '</span>' : ''}</div>
          ${watchHtml}
          ${underHtml}
        </div>
      </div>`;
  }

  let medicalDetailPlayerId = null;
  let medicalFilter = 'all';
  let medicalTeamFilter = 'all'; // 'all' | 'A' | 'B' | … — reset on category change
  let medicalPastExpanded = false;

  function renderStaffRoster() {
    const users = getUsers();
    var curCat = getCurrentCategory();
    const players = users.filter(u => (u.roles || []).includes('player'))
      // Uncategorised players used to fall through into every category's
      // roster. Registrations is where they get assigned; they don't belong
      // in another category's squad list.
      .filter(u => !curCat || (u.category || '') === curCat)
      .filter(u => rosterTeamFilter === 'all' || (u.team || '') === rosterTeamFilter)
      .sort((a, b) => posRankGlobal(a) - posRankGlobal(b));
    const _fitCtx = fitnessContext();
    const _msCtx = matchStatsContext();
    let rows = players.map(u => {
      const derived = deriveFitnessStatus(u.id, false, _fitCtx);
      const status = derived.fitnessStatus;
      const injuryNote = derived.injuryNote || (status === 'doubt' ? 'Doubt' : status === 'injured' ? 'Injury' : '');
      const pStats = computePlayerMatchStats(u.id, _msCtx);
      const matches = pStats.totals.matches;
      const minutes = pStats.totals.minutes;
      const titulars = pStats.totals.titulars;
      const goals = pStats.totals.goals;
      const assists = pStats.totals.assists;
      // Count suplents, NC, yellows, reds from matchRows
      var suplents = 0, noConvocats = 0, totalYellows = 0, totalReds = 0;
      pStats.matchRows.forEach(function(mr) {
        if (mr.status === 'Suplent') suplents++;
        else if (mr.status === 'NC') noConvocats++;
        totalYellows += (mr.yellows || 0); totalReds += (mr.reds || 0);
      });
      var gcMatch = (matches > 0 && (goals + assists) > 0) ? ((goals + assists) / matches).toFixed(1) : '';
      const rd = computeReadiness(u.id);

      let statusIcon = '';
      if (status === 'fit') {
        statusIcon = '<span class="roster-status-icon roster-status-fit">✓</span>';
      } else if (status === 'doubt') {
        statusIcon = `<span class="roster-status-icon roster-status-doubt" data-tooltip="${sanitize(injuryNote)}">?</span>`;
      } else {
        statusIcon = `<span class="roster-status-icon roster-status-injured" data-tooltip="${sanitize(injuryNote)}">✕</span>`;
      }

      const pTeam = u.team || '';
      const teamCircle = pTeam ? `<span class="conv-team-circle">${sanitize(pTeam)}</span>` : '';

      return `<tr>
        <td class="roster-pos-col"><span class="conv-pos-circles">${posCirclesHtmlGlobal(u)}</span></td>
        <td><a href="#" class="roster-player-link" data-player-id="${u.id}"><span class="roster-name-wrap">${sanitize(u.name)}${teamCircle}</span></a></td>
        <td class="center-cell">${statusIcon}</td>
        <td class="center-cell">${readinessCellHtml(rd, status === 'injured')}</td>
        <td class="center-cell roster-tsnc"><span class="roster-t">${titulars}</span>/<span class="roster-s">${suplents}</span>/<span class="roster-nc">${noConvocats}</span></td>
        <td class="center-cell roster-num">${minutes}'</td>
        <td class="center-cell roster-num">${goals || ''}</td>
        <td class="center-cell roster-num">${assists || ''}</td>
        <td class="center-cell roster-num">${totalYellows || ''}</td>
        <td class="center-cell roster-num">${totalReds || ''}</td>
        <td class="center-cell roster-num roster-gc">${gcMatch}</td>
      </tr>`;
    }).join('');

    if (players.length === 0) {
      rows = '<tr><td colspan="11" style="text-align:center;color:var(--text-secondary);padding:2rem;">' + t('roster.no_players') + '</td></tr>';
    }

    const btnAll = rosterTeamFilter === 'all' ? ' roster-team-btn-active' : '';
    var _rosterLetters = getTeamLetters(getCurrentCategory());
    var rosterLetterBtns = _rosterLetters.map(function(l) {
      var cls = rosterTeamFilter === l ? ' roster-team-btn-active' : '';
      return '<button class="roster-team-btn' + cls + '" data-roster-filter="' + l + '">' + l + '</button>';
    }).join('');

    // --- Team aggregate charts ---
    const rpeData = JSON.parse(localStorage.getItem('fa_player_rpe') || '{}');
    const trainingList = getTrainings();
    const matchesList = JSON.parse(localStorage.getItem('fa_matches') || '[]');
    const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
    const staffOverrides = JSON.parse(localStorage.getItem('fa_training_staff_override') || '{}');
    const matchAvailData = JSON.parse(localStorage.getItem('fa_match_availability') || '{}');
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
    const seasonStart = seasonStartStr(now);
    const playerUids = players.map(u => u.id);

    const dateAgg = {};
    playerUids.forEach(uid => {
      trainingList.forEach(t => {
        if (!t.date || t.date < seasonStart || t.date > todayStr) return;
        const entry = readRecord(rpeData, uid, t, 'rpe');
        const avail = readRecord(staffOverrides, uid, t, 'avail') ||
          readRecord(availData, uid, t, 'avail') || '';
        const key = t.date + '|training|' + (t.focus || 'Training');
        if (!dateAgg[key]) dateAgg[key] = { date: t.date, type: 'training', label: t.focus || 'Training', rpes: [], mins: [], skips: 0, injuries: 0, total: 0 };
        dateAgg[key].total++;
        if (avail === 'no') dateAgg[key].skips++;
        if (avail === 'injured') dateAgg[key].injuries++;
        if (entry && avail !== 'no' && avail !== 'injured') { dateAgg[key].rpes.push(entry.rpe); dateAgg[key].mins.push(entry.minutes); }
      });
      matchesList.forEach(m => {
        if (!m.date || m.date < seasonStart || m.date > todayStr) return;
        const entry = rpeData[uid + '_match_' + m.id];
        const avail = matchAvailData[uid + '_' + m.id] || '';
        const label = (m.home || '') + ' vs ' + (m.away || '');
        const key = m.date + '|match|' + label;
        if (!dateAgg[key]) dateAgg[key] = { date: m.date, type: 'match', label: label, rpes: [], mins: [], skips: 0, injuries: 0, total: 0 };
        dateAgg[key].total++;
        if (avail === 'no_disponible') dateAgg[key].skips++;
        if (entry) { dateAgg[key].rpes.push(entry.rpe); dateAgg[key].mins.push(entry.minutes); }
      });
      Object.keys(rpeData).forEach(rkey => {
        if (!rkey.startsWith(uid + '_extra_')) return;
        const entry = rpeData[rkey];
        if (!entry || !entry.date || entry.date < seasonStart || entry.date > todayStr) return;
        const key = entry.date + '|extra|' + (entry.tag || 'Extra');
        if (!dateAgg[key]) dateAgg[key] = { date: entry.date, type: 'extra', label: entry.tag || 'Extra', rpes: [], mins: [], skips: 0, injuries: 0, total: 0 };
        dateAgg[key].total++;
        if (entry.rpe != null) { dateAgg[key].rpes.push(entry.rpe); dateAgg[key].mins.push(entry.minutes); }
      });
    });
    const teamSessions = Object.values(dateAgg).map(agg => {
      const hasRpe = agg.rpes.length > 0;
      const avgRpe = hasRpe ? agg.rpes.reduce((a, b) => a + b, 0) / agg.rpes.length : null;
      const avgMin = hasRpe ? agg.mins.reduce((a, b) => a + b, 0) / agg.mins.length : null;
      return {
        date: agg.date, type: agg.type, label: agg.label,
        rpe: avgRpe != null ? +avgRpe.toFixed(1) : null,
        minutes: avgMin != null ? Math.round(avgMin) : null,
        skipped: agg.skips > agg.total / 2,
        injured: agg.injuries > agg.total / 2
      };
    }).sort((a, b) => a.date.localeCompare(b.date));
    const teamCharts = buildChartsHtml(teamSessions, { teamView: true });

    return `
      <h2 class="page-title">${t('page.player_roster')}</h2>
      ${_rosterLetters.length <= 1 ? '' : `<div class="roster-team-filter">
        <button class="roster-team-btn${btnAll}" data-roster-filter="all">${t('common.all')}</button>
        ${rosterLetterBtns}
      </div>`}
      <div class="card">
        <div class="table-wrap"><table class="roster-table">
          <thead><tr>
            <th class="roster-pos-col">${t('roster.th_pos')}</th><th>${t('roster.th_name')}</th>
            <th class="center-cell roster-th-wrap">${t('roster.th_status')}</th><th class="center-cell roster-th-wrap">${t('roster.th_ready')}</th>
            <th class="center-cell" title="Titular / Suplent / NC" style="font-size:1rem;color:#f9a825;line-height:1;">★</th>
            <th class="center-cell roster-icon-th"><img src="img/chrono.jpg" class="roster-icon-header" alt="min" title="Minutes"></th>
            <th class="center-cell roster-icon-th"><img src="img/gol.png" class="roster-icon-header" alt="gol" title="Goals"></th>
            <th class="center-cell roster-icon-th"><img src="img/assist.png" class="roster-icon-header" alt="assist" title="Assists"></th>
            <th class="center-cell roster-icon-th"><img src="img/groga.png" class="roster-icon-header" alt="groga" title="Yellow cards"></th>
            <th class="center-cell roster-icon-th"><img src="img/vermella.png" class="roster-icon-header" alt="vermella" title="Red cards"></th>
            <th class="center-cell roster-gc-header" title="Goal Contributions per Match">GC/P</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>
      <div class="roster-charts-row">
        ${teamCharts.acwr}
        ${teamCharts.rpe}
      </div>
      <div class="card">
        ${teamCharts.uaWeek}
      </div>`;
  }

  function renderMatchday() {
    const now = new Date();
    const TEAM = (_clubConfig && _clubConfig.name) ? _clubConfig.name : 'Esquerra';
    var curCat = getCurrentCategory();
    // New (unsaved) games from fa_matchday. These used to be shown
    // unfiltered while the saved matches below were scoped, so every coach
    // saw every category's drafts. saveGames() re-attaches the out-of-scope
    // drafts, since it rebuilds the list from the rendered rows.
    const newGames = JSON.parse(localStorage.getItem('fa_matchday') || '[]')
      .filter(g => !curCat || !g.category || g.category === curCat);
    const newRows = newGames.map((g, i) => matchdayRowHtml(g, i)).join('');
    const hasNew = newGames.length > 0;

    // Saved matches from fa_matches (future only)
    var allMatches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
    var savedMatches = allMatches.filter(function(m) {
      if (curCat && m.category && m.category !== curCat) return false;
      return true;
    }).sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });

    // Split into upcoming and past
    var upcomingMatches = savedMatches.filter(function(m) {
      if (!m.date) return true;
      var d = m.time ? new Date(m.date + 'T' + m.time + ':00') : new Date(m.date + 'T23:59:59');
      return d > now;
    });
    var pastMatches = savedMatches.filter(function(m) {
      if (!m.date) return false;
      var d = m.time ? new Date(m.date + 'T' + m.time + ':00') : new Date(m.date + 'T23:59:59');
      return d <= now;
    }).reverse(); // most recent first

    function buildSavedRow(m) {
      var isEditing = _mdEditingId === m.id;
      if (isEditing) {
        var isHome = isOurTeam(m.home);
        var opponent = isHome ? m.away : m.home;
        var homeChecked = isHome ? 'checked' : '';
        var awayChecked = !isHome ? 'checked' : '';
        return '<tr data-match-id="' + m.id + '" data-category="' + sanitize(m.category || '') + '">' +
          '<td><label class="md-radio"><input type="radio" name="ha-edit" value="home" ' + homeChecked + ' class="md-ha"> Home</label>' +
          '<label class="md-radio"><input type="radio" name="ha-edit" value="away" ' + awayChecked + ' class="md-ha"> Away</label></td>' +
          '<td class="md-team-cell">' + getTeamLetters(m.category || '').map(function(l) {
            return '<span class="md-team-circle' + ((m.team || '') === l ? ' active' : '') + '" data-team="' + l + '">' + l + '</span>';
          }).join('') + '</td>' +
          '<td><input type="text" class="reg-input md-date md-datepicker" value="' + sanitize(m.date || '') + '" placeholder="YYYY-MM-DD" readonly style="width:140px;cursor:pointer;"></td>' +
          '<td><input class="reg-input md-opponent" value="' + sanitize(opponent) + '" placeholder="Opponent" style="width:140px;"></td>' +
          '<td><input class="reg-input md-location" value="' + sanitize(m.location || '') + '" placeholder="Location" style="width:150px;"></td>' +
          '<td><input class="reg-input md-maplink" value="' + sanitize(m.mapLink || '') + '" placeholder="Google Maps link" style="width:150px;"></td>' +
          '<td><input type="text" class="reg-input md-kickoff" value="' + sanitize(m.time || '') + '" placeholder="HH:MM" pattern="[0-2][0-9]:[0-5][0-9]" maxlength="5" style="width:80px;text-align:center;"></td>' +
          '<td><button class="btn btn-primary btn-small md-save-edit" data-match-id="' + m.id + '">' + t('btn.save') + '</button> <button class="btn btn-outline btn-small md-cancel-edit" data-match-id="' + m.id + '">' + t('btn.cancel') + '</button></td>' +
        '</tr>';
      }
      var teamLetter = m.team || '';
      var homeName = isOurTeam(m.home) && teamLetter ? sanitize(m.home) + ' <span class="conv-team-circle">' + sanitize(teamLetter) + '</span>' : sanitize(m.home);
      var awayName = isOurTeam(m.away) && teamLetter ? sanitize(m.away) + ' <span class="conv-team-circle">' + sanitize(teamLetter) + '</span>' : sanitize(m.away);
      var dateObj = m.date ? new Date(m.date + 'T12:00:00') : null;
      var dateFmt = dateObj ? tDateShort(m.date) : '—';
      var timeFmt = m.time || '—';
      return '<tr class="md-saved-row">' +
        '<td>' + homeName + ' vs ' + awayName + '</td>' +
        '<td>' + dateFmt + '</td>' +
        '<td>' + timeFmt + '</td>' +
        '<td>' + sanitize(m.location || '') + '</td>' +
        '<td class="md-saved-actions"><button class="btn btn-outline btn-small md-edit-match" data-match-id="' + m.id + '">' + t('btn.edit') + '</button>' +
        ' <button class="md-remove-btn md-delete-match" data-match-id="' + m.id + '" title="Delete">&times;</button></td>' +
      '</tr>';
    }

    var upcomingRows = upcomingMatches.map(buildSavedRow).join('');
    var pastRows = pastMatches.map(buildSavedRow).join('');

    // New games section (add form)
    var newSection = '';
    if (hasNew) {
      newSection = '<div class="card" style="margin-bottom:1rem;">' +
        '<div class="card-title">' + t('cal.new_game') + '</div>' +
        '<div class="table-wrap"><table class="matchday-table">' +
        '<thead><tr><th>' + t('cal.th_home_away') + '</th><th>' + t('cal.th_team') + '</th><th>' + t('cal.th_date') + '</th><th>' + t('cal.th_opponent') + '</th><th>' + t('cal.th_location') + '</th><th>' + t('cal.th_map') + '</th><th>' + t('cal.th_kickoff') + '</th><th></th></tr></thead>' +
        '<tbody id="matchday-body">' + newRows + '</tbody></table></div>' +
        '<div class="matchday-bottom-actions">' +
        '<button class="btn btn-primary btn-small" id="btn-matchday-save">' + t('btn.save') + '</button>' +
        '</div></div>';
    }

    var theadHtml = '<thead><tr><th>' + t('cal.th_match') + '</th><th>' + t('cal.th_date') + '</th><th>' + t('cal.th_kickoff') + '</th><th>' + t('cal.th_location') + '</th><th></th></tr></thead>';

    var upcomingCard = '<div class="card" style="margin-bottom:1rem;"><div class="card-title">' + t('matches.upcoming') + '</div>' +
      (upcomingMatches.length ? '<div class="table-wrap"><table class="matchday-table md-saved-table">' + theadHtml + '<tbody>' + upcomingRows + '</tbody></table></div>'
        : '<p style="text-align:center;color:var(--text-secondary);padding:1rem;">' + t('matches.no_upcoming') + '</p>') +
      '</div>';

    var pastCard = '<div class="card"><div class="card-title">' + t('matches.past') + '</div>' +
      (pastMatches.length ? '<div class="table-wrap"><table class="matchday-table md-saved-table">' + theadHtml + '<tbody>' + pastRows + '</tbody></table></div>'
        : '<p style="text-align:center;color:var(--text-secondary);padding:1rem;">' + t('matches.no_past') + '</p>') +
      '</div>';

    return '<h2 class="page-title">' + t('page.set_calendar') + '</h2>' +
      '<div style="margin-bottom:1rem;"><button class="btn btn-outline btn-small matchday-add" id="btn-matchday-add" title="' + t('matches.add_game') + '">+ ' + t('matches.add_game') + '</button></div>' +
      newSection +
      upcomingCard +
      pastCard;
  }

  function buildTimeOptions(selected) {
    let opts = '<option value="">--:--</option>';
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        const val = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
        const sel = val === selected ? ' selected' : '';
        opts += `<option value="${val}"${sel}>${val}</option>`;
      }
    }
    return opts;
  }

  function jerseySvg(variant) {
    const fill = variant === 'yellow' ? '#FFD662' : '#FFFFFF';
    const collar = variant === 'yellow' ? '#e6b800' : '#CCCCCC';
    return `<svg viewBox="0 0 64 64" width="34" height="34" style="display:block">
      <path d="M22 6 L14 10 L6 18 L12 24 L16 20 L16 56 L48 56 L48 20 L52 24 L58 18 L50 10 L42 6" fill="${fill}" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M22 6 Q28 12 32 12 Q36 12 42 6" fill="none" stroke="${collar}" stroke-width="2"/>
      <line x1="16" y1="20" x2="48" y2="20" stroke="${collar}" stroke-width="1" opacity=".5"/>
      <image href="img/logo.png" x="33" y="18" width="10" height="10" opacity=".7"/>
    </svg>`;
  }
  function sockSvg(variant) {
    if (variant === 'yellow') {
      return `<svg viewBox="0 0 32 64" width="22" height="34" style="display:block">
        <path d="M8 2 L8 36 Q8 48 14 52 L22 56 Q28 58 28 50 L28 42 Q28 36 22 34 L22 2 Z" fill="#FFD662" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>
        <rect x="8" y="2" width="14" height="6" rx="1" fill="#222" stroke="none"/>
        <path d="M8 36 Q8 48 14 52 L22 56 Q28 58 28 50 L28 42 Q28 36 22 34 Z" fill="#222" opacity=".15"/>
      </svg>`;
    }
    return `<svg viewBox="0 0 32 64" width="22" height="34" style="display:block">
      <path d="M8 2 L8 36 Q8 48 14 52 L22 56 Q28 58 28 50 L28 42 Q28 36 22 34 L22 2 Z" fill="#fff" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>
      <rect x="8" y="2" width="14" height="6" rx="1" fill="#222" stroke="none"/>
      <rect x="8" y="12" width="14" height="4" fill="#222" stroke="none"/>
      <rect x="8" y="20" width="14" height="4" fill="#222" stroke="none"/>
      <rect x="8" y="28" width="14" height="4" fill="#222" stroke="none"/>
      <path d="M8 36 Q8 48 14 52 L22 56 Q28 58 28 50 L28 42 Q28 36 22 34 Z" fill="#222" stroke="none"/>
    </svg>`;
  }

  function matchdayRowHtml(g, i) {
    const homeChecked = g.homeAway === 'home' ? 'checked' : '';
    const awayChecked = g.homeAway === 'away' ? 'checked' : '';
    return `<tr data-idx="${i}" data-category="${sanitize(g.category || '')}">
      <td>
        <label class="md-radio"><input type="radio" name="ha-${i}" value="home" ${homeChecked} class="md-ha"> Home</label>
        <label class="md-radio"><input type="radio" name="ha-${i}" value="away" ${awayChecked} class="md-ha"> Away</label>
      </td>
      <td class="md-team-cell">
        ${getTeamLetters(g.category || getCurrentCategory() || '').map(function(l) {
          return '<span class="md-team-circle' + (g.team === l ? ' active' : '') + '" data-team="' + l + '">' + l + '</span>';
        }).join('')}
      </td>
      <td><input type="text" class="reg-input md-date md-datepicker" value="${sanitize(g.date || '')}" placeholder="YYYY-MM-DD" readonly style="width:140px;cursor:pointer;"></td>
      <td><input class="reg-input md-opponent" value="${sanitize(g.opponent || '')}" placeholder="Opponent name" style="width:140px;"></td>
      <td><input class="reg-input md-location" value="${sanitize(g.location || '')}" placeholder="Location" style="width:150px;"></td>
      <td><input class="reg-input md-maplink" value="${sanitize(g.mapLink || '')}" placeholder="Google Maps link" style="width:150px;"></td>
      <td><input type="text" class="reg-input md-kickoff" value="${sanitize(g.kickoff || '')}" placeholder="HH:MM" pattern="[0-2][0-9]:[0-5][0-9]" maxlength="5" style="width:80px;text-align:center;"></td>
      <td><button class="md-remove-btn md-remove" data-idx="${i}" title="Remove">&times;</button></td>
    </tr>`;
  }

  function renderConvocatoria() {
    var allMatches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
    var curCat = getCurrentCategory();
    var matches = curCat ? allMatches.filter(function(m) { return !m.category || m.category === curCat; }) : allMatches;
    var now = new Date();
    const upcoming = matches.filter(function(m) {
      if (!m.date || !m.time) return m.status === 'upcoming';
      var kickoff = new Date(m.date + 'T' + m.time + ':00');
      return kickoff > now;
    });
    if (convSelectedMatchId === null && upcoming.length) convSelectedMatchId = upcoming[0].id;
    // If the selected match has already started, deselect it
    if (convSelectedMatchId && !upcoming.some(function(m) { return m.id === convSelectedMatchId; })) {
      convSelectedMatchId = upcoming.length ? upcoming[0].id : null;
    }
    const selected = matches.find(m => m.id === convSelectedMatchId) || null;
    const users = getUsers();
    var playersAll = users.filter(u => (u.roles || []).includes('player'));
    var players = curCat ? playersAll.filter(function(p) { return !p.category || p.category === curCat; }) : playersAll;
    const allConvRaw = JSON.parse(localStorage.getItem('fa_convocatoria') || '{}');
    const allConv = Array.isArray(allConvRaw) ? {} : allConvRaw;
    const saved = convSelectedMatchId ? (allConv[convSelectedMatchId] || []) : [];
    const _convFitCtx = fitnessContext();
    function playerStatusHtml(p) {
      const derived = deriveFitnessStatus(p.id, false, _convFitCtx);
      const status = derived.fitnessStatus;
      const injuryNote = derived.injuryNote || (status === 'doubt' ? 'Doubt' : status === 'injured' ? 'Injury' : '');
      const rd = computeReadiness(p.id);
      let icon = '';
      if (status === 'fit') icon = '<span class="roster-status-icon roster-status-fit">✓</span>';
      else if (status === 'doubt') icon = `<span class="roster-status-icon roster-status-doubt" data-tooltip="${sanitize(injuryNote)}">?</span>`;
      else icon = `<span class="roster-status-icon roster-status-injured" data-tooltip="${sanitize(injuryNote)}">✕</span>`;
      return icon + readinessCellHtml(rd, status === 'injured');
    }

    const POS_ORDER = ['GK','CB','LB','RB','DM','OM','LW','RW','ST'];
    function posRank(p) {
      return posRankGlobal(p);
    }
    function posCirclesHtml(p) {
      return posCirclesHtmlGlobal(p);
    }

    const matchOptions = upcoming.length
      ? upcoming.map(m => {
          const active = m.id === convSelectedMatchId ? ' conv-match-option-active' : '';
          const teamLetter = m.team ? ` (${sanitize(m.team)})` : '';
          const homeName = isOurTeam(m.home) ? getClubName() + teamLetter : sanitize(m.home);
          const awayName = isOurTeam(m.away) ? getClubName() + teamLetter : sanitize(m.away);
          const dateObj = m.date ? new Date(m.date + 'T12:00:00') : null;
          const dateFmt = dateObj ? tDateShort(m.date) : '';
          return `<div class="conv-match-option${active}" data-mid="${m.id}"><div class="conv-match-teams">${homeName} vs ${awayName}</div><div class="conv-match-date">${dateFmt}<span class="conv-match-time">${m.time || ''}</span></div></div>`;
        }).join('')
      : '<div class="conv-match-empty">No upcoming matches</div>';

    const sentData = JSON.parse(localStorage.getItem('fa_convocatoria_sent') || '{}');
    const sentEntry = convSelectedMatchId && sentData[convSelectedMatchId] ? sentData[convSelectedMatchId] : null;
    const sentPlayers = sentEntry ? (Array.isArray(sentEntry) ? sentEntry : (sentEntry.players || [])) : null;
    const isSent = !!sentPlayers;
    const hasChanges = isSent && JSON.stringify(saved) !== JSON.stringify(sentPlayers);

    const calledIds = new Set(saved.map(String));
    const matchAvailData = JSON.parse(localStorage.getItem('fa_match_availability') || '{}');
    const available = players.filter(p => !calledIds.has(String(p.id))).sort((a, b) => posRank(a) - posRank(b));
    const called = saved.map(id => players.find(p => String(p.id) === String(id))).filter(Boolean).sort((a, b) => posRank(a) - posRank(b));

    const availableHtml = available.length
      ? available.map(p => {
          const maKey = p.id + '_' + convSelectedMatchId;
          const maStatus = matchAvailData[maKey] || null;
          const isNoDisp = maStatus === 'no_disponible';
          const dragAttr = isNoDisp ? 'draggable="false"' : 'draggable="true"';
          const greyClass = isNoDisp ? ' conv-player-unavailable' : '';
          const maTag = maStatus === 'disponible' ? '<span class="conv-ma-tag conv-ma-disp">Disponible</span>'
            : maStatus === 'no_disponible' ? '<span class="conv-ma-tag conv-ma-nodisp">No Disponible</span>'
            : '<span class="conv-ma-tag conv-ma-pending">—</span>';
          const pTeam = p.team || '';
          return `<div class="conv-player${greyClass}" ${dragAttr} data-id="${p.id}"><span class="conv-pos-circles">${posCirclesHtml(p)}</span><span class="conv-name-wrap"><span class="conv-name">${sanitize(p.name)}</span>${pTeam ? `<span class="conv-team-circle">${sanitize(pTeam)}</span>` : ''}</span><span class="conv-num">#${sanitize(p.playerNumber || '—')}</span>${maTag}<span class="conv-status">${playerStatusHtml(p)}</span></div>`;
        }).join('')
      : '<p class="conv-empty-hint">No players available</p>';

    const calledHtml = called.length
      ? called.map(p => { const pTeam = p.team || ''; return `<div class="conv-player conv-called" draggable="true" data-id="${p.id}"><span class="conv-pos-circles">${posCirclesHtml(p)}</span><span class="conv-name-wrap"><span class="conv-name">${sanitize(p.name)}</span>${pTeam ? `<span class="conv-team-circle">${sanitize(pTeam)}</span>` : ''}</span><span class="conv-num">#${sanitize(p.playerNumber || '—')}</span><span class="conv-status">${playerStatusHtml(p)}</span><button class="conv-remove" data-id="${p.id}" title="Remove">&times;</button></div>`; }).join('')
      : '<p class="conv-drop-hint"><span class="conv-hint-desktop">' + t('conv.drag_desktop') + '</span><span class="conv-hint-mobile">' + t('conv.drag_mobile') + '</span></p>';

    // Uniform: auto-default for home games
    const uniformData = JSON.parse(localStorage.getItem('fa_convocatoria_uniform') || '{}');
    let curJersey = 'white';
    let curSocks = 'striped';
    if (convSelectedMatchId && uniformData[convSelectedMatchId]) {
      curJersey = uniformData[convSelectedMatchId].jersey || 'white';
      curSocks = uniformData[convSelectedMatchId].socks || 'striped';
    } else if (selected && isOurTeam(selected.home)) {
      curJersey = 'white'; curSocks = 'striped';
    }
    const jWhite = curJersey === 'white' ? ' uniform-opt-active' : '';
    const jYellow = curJersey === 'yellow' ? ' uniform-opt-active' : '';
    const sStriped = curSocks === 'striped' ? ' uniform-opt-active' : '';
    const sYellow = curSocks === 'yellow' ? ' uniform-opt-active' : '';

    // Default callup: 1h30 before kickoff, rounded down to 15min
    const convCallupData = JSON.parse(localStorage.getItem('fa_convocatoria_callup') || '{}');
    let callupDefault = '';
    if (selected) {
      const savedCallup = convSelectedMatchId ? convCallupData[convSelectedMatchId] : null;
      if (savedCallup) {
        callupDefault = savedCallup;
      } else if (selected.time) {
        const parts = selected.time.split(':');
        let totalMin = Number(parts[0]) * 60 + Number(parts[1]) - 90;
        if (totalMin < 0) totalMin += 24 * 60;
        totalMin = Math.floor(totalMin / 15) * 15;
        const ch = Math.floor(totalMin / 60) % 24;
        const cm = totalMin % 60;
        callupDefault = String(ch).padStart(2, '0') + ':' + String(cm).padStart(2, '0');
        // Persist the computed default
        if (convSelectedMatchId) {
          convCallupData[convSelectedMatchId] = callupDefault;
          localStorage.setItem('fa_convocatoria_callup', JSON.stringify(convCallupData));
        }
      }
    }

    return `
      <h2 class="page-title">${t('page.convocatoria')}</h2>
      <div class="card" style="margin-bottom:1.5rem;">
        <div class="conv-top-row">
          <div class="conv-top-group">
            <div class="card-title" style="margin-bottom:.5rem;">${t('conv.choose_match')}</div>
            <div class="conv-match-selector" id="conv-match-selector">
              <div class="conv-match-toggle" id="conv-match-toggle">
                ${selected ? `<div class="conv-match-toggle-info"><div class="conv-match-teams">${sanitize(selected.home)}${selected.team && isOurTeam(selected.home) ? ' (' + sanitize(selected.team) + ')' : ''} vs ${sanitize(selected.away)}${selected.team && isOurTeam(selected.away) ? ' (' + sanitize(selected.team) + ')' : ''}</div><div class="conv-match-date">${selected.date ? tDateShort(selected.date) : ''}<span class="conv-match-time">${selected.time || ''}</span></div></div>` : '<span style="color:var(--text-secondary)">' + t('conv.select_match') + '</span>'}
                <span class="conv-match-chevron"></span>
              </div>
              <div class="conv-match-dropdown" id="conv-match-dropdown" hidden>${matchOptions}</div>
            </div>
          </div>
          ${selected ? `<div class="conv-top-group">
            <div class="card-title" style="margin-bottom:.5rem;">${t('conv.callup_time')}</div>
            <select class="conv-callup-select" id="conv-callup-time">${buildTimeOptions(callupDefault)}</select>
          </div>
          <div class="conv-top-group">
            <div class="card-title" style="margin-bottom:.5rem;text-align:center;">${t('conv.uniform')}</div>
            <div class="conv-uniform-row">
              <div class="conv-uniform-group">
                <span class="conv-uniform-label">${t('conv.jersey')}</span>
                <div class="uniform-toggle" id="conv-jersey-toggle">
                  <button type="button" class="uniform-opt conv-jersey-opt${jWhite}" data-val="white" title="White">${jerseySvg('white')}</button>
                  <button type="button" class="uniform-opt conv-jersey-opt${jYellow}" data-val="yellow" title="Yellow">${jerseySvg('yellow')}</button>
                </div>
              </div>
              <div class="conv-uniform-group">
                <span class="conv-uniform-label">${t('conv.socks')}</span>
                <div class="uniform-toggle" id="conv-socks-toggle">
                  <button type="button" class="uniform-opt conv-socks-opt${sStriped}" data-val="striped" title="Black & White">${sockSvg('striped')}</button>
                  <button type="button" class="uniform-opt conv-socks-opt${sYellow}" data-val="yellow" title="Yellow">${sockSvg('yellow')}</button>
                </div>
              </div>
            </div>
          </div>` : ''}
        </div>
      </div>
      <div class="conv-layout">
        <div class="conv-panel">
          <div class="conv-panel-header">${t('conv.available')} <span class="conv-count" id="conv-avail-count">${available.length}</span></div>
          <div class="conv-list" id="conv-available">${availableHtml}</div>
        </div>
        <div class="conv-panel conv-panel-called">
          <div class="conv-panel-header">${t('conv.called_up')} <span class="conv-count" id="conv-called-count">${called.length}</span></div>
          <div class="conv-list conv-drop-zone" id="conv-called">${calledHtml}</div>
          <div class="conv-actions">
            <button class="btn btn-small" id="btn-conv-clear" style="background:#9e9e9e;color:#fff;border:none;">${t('btn.clear_all')}</button>
            <button class="btn btn-outline btn-small" id="btn-conv-save">${t('btn.save')}</button>
            <button class="btn ${isSent && !hasChanges ? 'btn-danger' : 'btn-primary'} btn-small" id="btn-conv-send">${isSent && !hasChanges ? t('btn.unsend') : t('btn.send')}</button>
          </div>
        </div>
      </div>
      ${(() => {
        if (!convSelectedMatchId) return '';
        const matchBoards = JSON.parse(localStorage.getItem('fa_tactic_match_boards') || '{}');
        const boards = matchBoards[convSelectedMatchId] || [];
        if (!boards.length) return '';
        return '<div class="card"><div class="card-title">' + t('conv.tactical_board') + '</div>' +
          boards.map(b => renderReadOnlyBoard(b, 'ro2-')).join('') + '</div>';
      })()}
      ${(() => {
        if (!convSelectedMatchId) return '';
        const vData = JSON.parse(localStorage.getItem('fa_convocatoria_videos') || '{}');
        const videos = vData[convSelectedMatchId] || [];
        const rows = videos.map((v, i) => '<div class="conv-video-row" data-video-idx="' + i + '">' +
          '<input type="text" class="reg-input conv-video-title" value="' + sanitize(v.title) + '" placeholder="' + t('conv.video_title_ph') + '" style="flex:1;min-width:80px;">' +
          '<input type="text" class="reg-input conv-video-url" value="' + sanitize(v.url) + '" placeholder="' + t('conv.video_url_ph') + '" style="flex:2;min-width:140px;">' +
          '<button class="btn btn-small conv-video-remove" style="background:#c62828;color:#fff;border:none;padding:.2rem .5rem;">✕</button></div>' +
          (v.title ? '<textarea class="reg-input conv-video-comment" data-video-idx="' + i + '" rows="2" placeholder="' + t('conv.video_comment_ph') + '" style="width:100%;resize:vertical;min-height:40px;margin-bottom:.6rem;">' + sanitize(v.comment || '') + '</textarea>' : '')).join('');
        return '<div class="card">' +
          '<div class="card-title">' + t('conv.video_links') + '</div>' +
          '<div id="conv-video-list">' + rows + '</div>' +
          '<button class="btn btn-outline btn-small" id="btn-conv-add-video" style="margin-top:.5rem;">' + t('conv.add_video') + '</button>' +
          '</div>';
      })()}`;
  }

  function renderMatches() {
    var allMatches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
    var curCat = getCurrentCategory();
    var matches = curCat ? allMatches.filter(function(m) { return !m.category || m.category === curCat; }) : allMatches;
    const sentData = JSON.parse(localStorage.getItem('fa_convocatoria_sent') || '{}');
    const now = new Date();
    const upcoming = matches.filter(m => {
      if (!m.date || !m.time) return true;
      return new Date(m.date + 'T' + m.time + ':00') > now;
    });
    const past = matches.filter(m => {
      if (!m.date || !m.time) return false;
      return new Date(m.date + 'T' + m.time + ':00') <= now;
    }).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    function buildCard(m, clickable) {
      const teamLetter = m.team || '';
      const homeName = isOurTeam(m.home) && teamLetter ? getClubName() + ' <span class="conv-team-circle">' + sanitize(teamLetter) + '</span>' : sanitize(m.home);
      const awayName = isOurTeam(m.away) && teamLetter ? getClubName() + ' <span class="conv-team-circle">' + sanitize(teamLetter) + '</span>' : sanitize(m.away);
      let dateFmt = '—';
      if (m.date) {
        const d = new Date(m.date + 'T12:00:00');
        const dayName = tDay(d.getDay());
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        dateFmt = dayName + ' ' + dd + '/' + mm + '/' + yyyy;
      }
      const locationHtml = m.mapLink
        ? `<a href="${sanitize(m.mapLink)}" target="_blank" rel="noopener" class="md-card-map" onclick="event.stopPropagation()">📍 ${sanitize(m.location || '—')}</a>`
        : `<span>📍 ${sanitize(m.location || '—')}</span>`;
      const sentEntry = sentData[m.id];
      const sentPlayers = sentEntry ? (Array.isArray(sentEntry) ? sentEntry : (sentEntry.players || [])) : [];
      const convHtml = sentPlayers.length
        ? `<span class="md-conv-sent"><span class="conv-blink-dot"></span> ${t('matches.conv_sent')}<span class="md-conv-count">${sentPlayers.length} ${t('matches.players')}</span></span>`
        : '';
      const clickAttr = clickable ? ` data-go-staff-match="${m.id}"` : '';
      return `<div class="md-match-card${clickable ? '' : ' md-match-card-past'}"${clickAttr}>
        <div class="md-match-left">
          <div class="md-match-teams">${homeName} vs ${awayName}</div>
          <div class="md-match-info"><span>🗓 ${dateFmt}</span><span><img src="img/whistle.png" class="kickoff-icon" alt=""> ${m.time || '—'}</span>${locationHtml}</div>
        </div>
        ${convHtml}
      </div>`;
    }
    const upcomingCards = upcoming.length
      ? upcoming.map(m => buildCard(m, true)).join('')
      : '<p style="color:var(--text-secondary)">' + t('matches.no_upcoming') + '</p>';
    const pastCards = past.length
      ? past.map(m => buildCard(m, true)).join('')
      : '<p style="color:var(--text-secondary)">' + t('matches.no_previous') + '</p>';

    return `
      <h2 class="page-title">${t('page.matchday')}</h2>
      <div class="card">
        <div class="card-title">${t('matches.upcoming')}</div>
        <div class="md-match-list">${upcomingCards}</div>
      </div>
      <div class="card">
        <div class="card-title">${t('matches.previous')}</div>
        <div class="md-match-list">${pastCards}</div>
      </div>`;
  }


  function renderAdminUsers() {
    const users = getUsers();
    const session = getSession();
    // Roles are read-only here. The Player/Staff toggles that used to live in
    // this column only ever rewrote the local roster blob — they never called
    // setRole, so the badge changed and the person's real permissions did not.
    // Roles come from the email lists now: staff in "Configura el teu club",
    // players in the pre-registered list on Registrations.
    let rows = users.map(u => {
      const roleLabels = {
        player: t('common.player'), staff: t('common.staff'), lead: t('auth.role_lead'),
      };
      const rolesDisplay = (u.roles || []).length
        ? (u.roles || []).map(r => `<span class="badge badge-green">${roleLabels[r] || r}</span>`).join(' ')
        : '<span class="badge badge-yellow">' + t('reg.status_none') + '</span>';

      return `<tr>
        <td>${sanitize(u.name)}${u.isAdmin ? ' <span class="badge badge-red">admin</span>' : ''}</td>
        <td>${sanitize(u.email)}</td>
        <td>${rolesDisplay}</td>
        <td class="user-actions">
          ${u.id !== session.id && !u.isAdmin ? `<button class="btn btn-small btn-danger btn-delete-user" data-uid="${u.id}">${t('btn.delete')}</button>` : ''}
        </td>
      </tr>`;
    }).join('');
    return `
      <h2 class="page-title">${t('page.manage_users')}</h2>
      <div class="card">
        <div class="card-title">${t('users.all_users')}</div>
        <p style="color:var(--text-secondary);font-size:.85rem;margin-bottom:1rem;">${t('users.delete_desc')}</p>
        <div class="table-wrap"><table>
          <thead><tr><th>${t('users.th_name')}</th><th>${t('users.th_email')}</th><th>${t('users.th_roles')}</th><th>${t('users.th_actions')}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;
  }

  /**
   * Show the shared body-level tooltip above an element.
   *
   * Rendered into <body> rather than as a pseudo-element on the target,
   * because these dots live inside .table-wrap — whose overflow-x:auto makes
   * the vertical axis clip too, truncating anything that escapes the row.
   */
  function showHoverTip(el, text) {
    if (!text) return;
    let tt = document.getElementById('ua-tooltip');
    if (!tt) {
      tt = document.createElement('div');
      tt.id = 'ua-tooltip';
      tt.className = 'ua-tooltip';
      document.body.appendChild(tt);
    }
    tt.textContent = text;
    tt.classList.add('visible');
    const r = el.getBoundingClientRect();
    tt.style.left = (r.left + r.width / 2) + 'px';
    tt.style.top = (r.top - 8) + 'px';
  }
  function hideHoverTip() {
    const tt = document.getElementById('ua-tooltip');
    if (tt) tt.classList.remove('visible');
  }

  /**
   * "You are running an old build" banner. Dismissable, and the dismissal is
   * remembered per required-version so raising minAppVersion nags again but
   * a single release does not nag on every page.
   *
   * `updateUrl` is a club field rather than a constant because GitHub Actions
   * artifacts have no stable public URL — without one the banner still says
   * what is wrong, it just cannot offer the download.
   */
  function renderUpdateBanner() {
    var need = _clubConfig && Number(_clubConfig.minAppVersion || 0);
    if (!need || need <= APP_VERSION) return '';
    if (localStorage.getItem('fa_update_dismissed') === String(need)) return '';
    var url = (_clubConfig && _clubConfig.updateUrl) || '';
    var link = url
      ? '<a href="' + sanitize(url) + '" target="_blank" rel="noopener" class="upd-link">' +
        t('update.download') + '</a>'
      : '';
    return '<div class="upd-banner" data-need="' + need + '">' +
      '<span class="upd-text">' + t('update.msg')
        .replace('{have}', APP_VERSION).replace('{need}', need) + '</span>' +
      link +
      '<button class="upd-close" title="' + t('common.cancel') + '">✕</button>' +
      '</div>';
  }

  /** Green = they have an account; orange = invited, not signed up yet. */
  function regDot(registered) {
    const cls = registered ? 'reg-dot-on' : 'reg-dot-off';
    const tip = registered ? t('reg.dot_registered') : t('reg.dot_pending');
    return `<span class="reg-dot ${cls}" data-tip="${sanitize(tip)}"></span>`;
  }

  function renderRegistrations() {
    const users = getUsers();
    const curCat = getCurrentCategory();
    const enabledCats = getEnabledCategories();
    const session = getSession();
    // Only the lead may change roles — setRole rejects everyone else, and
    // staff membership is driven by the club's staff email lists anyway.
    const canEditRoles = !!(session && (session.isAdmin || session.isTeamLead));
    // Two groups. Assigned = in a squad, and category-filtered like the rest
    // of the app. Unassigned = in the club but in no squad: brand-new members
    // nobody has placed yet, and anyone just taken off a team with "Treure de
    // l'equip". They are NOT category-filtered — they have no category, so any
    // coach can pick them up.
    const assigned = users.filter(u => (u.category || '') &&
      (!curCat || (u.category || '') === curCat));
    const unassigned = users.filter(u => !(u.category || ''));

    // Pre-registered addresses nobody has claimed yet are shown in the same
    // table, with an orange dot. Without them an invited player is invisible
    // until they sign up, and the dot would be meaningless — every row in a
    // members table is registered by definition.
    const heldEmails = {};
    users.forEach(u => {
      const em = normalizeEmail(u.email);
      if (em) heldEmails[em] = true;
    });
    const rosters = (_clubConfig && _clubConfig.rosters) ? _clubConfig.rosters : {};
    const pending = [];
    Object.keys(rosters).forEach(key => {
      const cat = key.slice(0, key.indexOf('-'));
      const letter = key.slice(key.indexOf('-') + 1);
      if (curCat && cat !== curCat) return;
      ((rosters[key] || {}).playerEmails || []).forEach(raw => {
        const em = normalizeEmail(raw);
        if (!em || heldEmails[em]) return;
        pending.push({ email: em, category: cat, team: letter, key: key });
      });
    });

    let rows = assigned.map(u => {
      const roles = u.roles || [];
      let status = 'none';
      if (roles.includes('player') && roles.includes('staff')) status = 'both';
      else if (roles.includes('player')) status = 'player';
      else if (roles.includes('staff')) status = 'staff';

      const picHtml = u.profilePic
        ? `<img src="${u.profilePic}" class="reg-avatar" alt="">`
        : `<span class="reg-avatar reg-avatar-placeholder">${sanitize(u.name).charAt(0).toUpperCase()}</span>`;

      const positions = (u.position || '').split(',').map(s => s.trim()).filter(Boolean);
      const posOptions = ['GK','CB','LB','RB','DM','OM','LW','RW','ST'];
      const posChips = posOptions.map(p => `<span class="reg-pos-chip${positions.includes(p) ? ' active' : ''}" data-pos="${p}">${p}</span>`).join('');

      const team = u.team || '';
      const uCat = u.category || '';
      const catOptions = enabledCats.length
        ? enabledCats.map(function (k) { return '<option value="' + k + '"' + (uCat === k ? ' selected' : '') + '>' + CATEGORY_LABELS[k] + '</option>'; }).join('')
        : '';
      const catSelect = enabledCats.length
        ? '<select class="reg-cat-select" data-uid="' + u.id + '"><option value=""' + (!uCat ? ' selected' : '') + '>—</option>' + catOptions + '</select>'
        : '';

      // Estat is a choice only for someone who is actually staff, and only the
      // lead may make it — setRole rejects anyone else. A player's status
      // follows from being on a player list, and someone whose only role is
      // running the club has no meaningful option now that "Cap" is gone.
      //
      // Test for the lead ROLE, not for "has neither player nor staff": the
      // second is also true of anyone whose roles are empty, and it labelled
      // them Responsable del club. Empty roles fall through to the plain
      // status label below, which reads "Cap" and is at least honest.
      const isStaffRow = roles.includes('staff');
      const isLeadRow = !roles.includes('player') && !isStaffRow &&
        (roles.includes('lead') || u.isTeamLead === true);
      const statusCell = isLeadRow
        ? `<span class="reg-status-flat">${t('auth.role_lead')}</span>`
        : (isStaffRow && canEditRoles
          ? `<select class="reg-status-select" data-uid="${u.id}">
              <option value="player" ${status === 'player' ? 'selected' : ''}>${t('reg.status_player')}</option>
              <option value="staff" ${status === 'staff' ? 'selected' : ''}>${t('reg.status_staff')}</option>
              <option value="both" ${status === 'both' ? 'selected' : ''}>${t('reg.status_both')}</option>
            </select>`
          : `<span class="reg-status-flat">${t('reg.status_' + status)}</span>`);

      return `<tr data-uid="${u.id}">
        <td class="reg-name-cell">${regDot(true)}${picHtml} <span>${sanitize(u.name)}${u.isAdmin ? ' <span class="badge badge-red">admin</span>' : ''}</span></td>
        <td class="reg-email-cell">${sanitize(u.email || '')}</td>
        <td>${statusCell}</td>
        <td>${catSelect}</td>
        <td class="reg-team-cell">
          ${getTeamLetters(u.category || '').map(function(l) {
            return '<span class="reg-team-circle' + (team === l ? ' active' : '') + '" data-uid="' + u.id + '" data-team="' + l + '">' + l + '</span>';
          }).join('')}
        </td>
        <td class="reg-pos-cell">${posChips}</td>
        <td><input type="text" inputmode="numeric" class="reg-input reg-number" data-uid="${u.id}" value="${u.playerNumber || ''}" placeholder="#" maxlength="2"></td>
        <td class="reg-actions">
          ${(() => {
            // "Leave the squad", not a delete: it detaches the member and
            // keeps every record. Only offered when they are actually in a
            // squad. Staff are appointed through the lead's staff email
            // lists, which the rules put out of a coach's reach — so for a
            // staff member only the lead sees the button.
            const isStaffMember = roles.includes('staff');
            if (!uCat && !team) return '';
            if (isStaffMember && !canEditRoles) return '';
            return `<button class="btn btn-small btn-outline btn-remove-reg" data-uid="${u.id}">${t('btn.leave_squad')}</button>`;
          })()}
        </td>
      </tr>`;
    }).join('');

    // Invited but not signed up: no user document exists, so there is nothing
    // to write a role, position or number to. Those cells are static; the only
    // action is taking the address back off the list.
    rows += pending.map(p => `<tr class="reg-row-pending" data-pending-email="${sanitize(p.email)}" data-pending-key="${sanitize(p.key)}">
        <td class="reg-name-cell">${regDot(false)}<span class="reg-avatar reg-avatar-placeholder">?</span>
          <span style="color:var(--text-secondary);font-style:italic;">${t('reg.pre_pending')}</span></td>
        <td class="reg-email-cell">${sanitize(p.email)}</td>
        <td><span class="reg-status-flat">${t('reg.status_player')}</span></td>
        <td><span class="reg-status-flat">${CATEGORY_LABELS[p.category] || p.category}</span></td>
        <td class="reg-team-cell"><span class="reg-team-circle active">${sanitize(p.team)}</span></td>
        <td class="reg-pos-cell"></td>
        <td></td>
        <td class="reg-actions">
          <button class="btn btn-small btn-outline btn-remove-pending"
            data-pending-email="${sanitize(p.email)}" data-pending-key="${sanitize(p.key)}">${t('btn.leave_squad')}</button>
        </td>
      </tr>`).join('');

    // Assigning is scoped to the categories this user may actually write a
    // player list for — the rules reject anything else, so offering it would
    // only produce a permission error. Lead and admin get the whole club.
    const assignCats = getVisibleCategories();
    const unassignedRows = unassigned.map(u => {
      const picHtml = u.profilePic
        ? `<img src="${u.profilePic}" class="reg-avatar" alt="">`
        : `<span class="reg-avatar reg-avatar-placeholder">${sanitize(u.name).charAt(0).toUpperCase()}</span>`;
      const prevCat = u.prevCategory || '';
      const prevLabel = prevCat
        ? (CATEGORY_LABELS[prevCat] || prevCat) + (u.prevTeam ? ' ' + sanitize(u.prevTeam) : '')
        : '—';
      // Default to where they came from when that category is still one of
      // ours; it is the overwhelmingly likely destination.
      const preselect = assignCats.indexOf(prevCat) !== -1 ? prevCat : (assignCats[0] || '');
      const catOpts = assignCats.map(k =>
        `<option value="${k}"${k === preselect ? ' selected' : ''}>${CATEGORY_LABELS[k] || k}</option>`).join('');
      const letters = getTeamLetters(preselect);
      const letterOpts = letters.map(l =>
        `<option value="${l}"${l === (u.prevTeam || '') ? ' selected' : ''}>${l}</option>`).join('');
      return `<tr data-uid="${u.id}">
        <td class="reg-name-cell">${regDot(true)}${picHtml} <span>${sanitize(u.name)}${u.isAdmin ? ' <span class="badge badge-red">admin</span>' : ''}</span></td>
        <td class="reg-email-cell">${sanitize(u.email || '')}</td>
        <td><span class="reg-status-flat">${prevLabel}</span></td>
        <td class="reg-assign-cell">
          ${assignCats.length ? `
            <select class="reg-input reg-assign-cat" data-uid="${u.id}">${catOpts}</select>
            <select class="reg-input reg-assign-team" data-uid="${u.id}">${letterOpts}</select>
            <button class="btn btn-small btn-primary btn-assign" data-uid="${u.id}">${t('reg.assign')}</button>
          ` : `<span class="reg-status-flat">${t('error.no_categories')}</span>`}
        </td>
      </tr>`;
    }).join('');

    const unassignedCard = `
      <div class="card">
        <div class="card-title">${t('reg.unassigned')} (${unassigned.length})</div>
        <p style="color:var(--text-secondary);font-size:.85rem;margin-bottom:1rem;">
          ${t('reg.unassigned_desc')}
        </p>
        ${unassigned.length ? `<div class="table-wrap"><table>
          <thead><tr><th>${t('reg.th_name')}</th><th>${t('users.th_email')}</th><th>${t('reg.th_prev_team')}</th><th>${t('reg.th_assign')}</th></tr></thead>
          <tbody>${unassignedRows}</tbody>
        </table></div>` : `<p style="color:var(--text-secondary);font-size:.85rem;">${t('reg.unassigned_none')}</p>`}
      </div>`;

    return `
      <h2 class="page-title">${t('page.registrations')}</h2>
      ${renderPreRegisteredPlayers()}
      <div class="card">
        <div class="card-title">${t('reg.assigned')} (${assigned.length + pending.length})</div>
        <p style="color:var(--text-secondary);font-size:.85rem;margin-bottom:1rem;">
          ${t('reg.edit_desc')}
        </p>
        <div class="table-wrap"><table>
          <thead><tr><th>${t('reg.th_name')}</th><th>${t('users.th_email')}</th><th>${t('reg.th_status')}</th><th>${t('reg.th_category')}</th><th style="text-align:center">${t('reg.th_team')}</th><th>${t('reg.th_position')}</th><th>${t('reg.th_number')}</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>
      ${unassignedCard}`;
  }

  /**
   * The player email lists for the currently selected category — the gate that
   * decides who may register onto these teams. One block per team letter.
   * Registration is refused for any address not listed here, so this is where
   * staff sign a new player up before the family ever opens the app.
   */
  function renderPreRegisteredPlayers() {
    var cat = getCurrentCategory();
    if (!cat) {
      return `<div class="card">
        <div class="card-title">${t('reg.pre_title')}</div>
        <p style="color:var(--text-secondary);font-size:.85rem;">${t('reg.pre_no_cat')}</p>
      </div>`;
    }
    var letters = getTeamLetters(cat);
    var opts = letters.map(function (l) {
      return '<option value="' + l + '">' + CATEGORY_LABELS[cat] + ' ' + l + '</option>';
    }).join('');
    return `<div class="card">
      <div class="card-title">${t('reg.pre_title')}</div>
      <p style="color:var(--text-secondary);font-size:.85rem;margin-bottom:1rem;">${t('reg.pre_desc')}</p>
      <div class="reg-add-row">
        <input type="email" inputmode="email" autocomplete="off" id="reg-add-email"
          class="reg-input" placeholder="${t('auth.email_ph')}">
        <select id="reg-add-team" class="reg-input">${opts}</select>
        <button class="btn btn-primary btn-small" id="reg-add-btn">${t('reg.pre_add')}</button>
      </div>
      <div id="reg-add-msg" style="font-size:.83rem;margin-top:.5rem;"></div>
    </div>`;
  }

  /**
   * Add one address to a team's player list.
   *
   * Refuses an address already on ANY list in the club, or one already held by
   * an assigned member — a duplicate would show as two rows for one person and,
   * worse, put them on two teams at once.
   */
  async function addPreRegisteredPlayer() {
    var session = getSession();
    var msg = document.getElementById('reg-add-msg');
    var inp = document.getElementById('reg-add-email');
    var sel = document.getElementById('reg-add-team');
    if (!session || !session.teamId || !inp || !sel) return;
    var email = normalizeEmail(inp.value);
    var cat = getCurrentCategory();
    var key = cat + '-' + sel.value;
    var show = function (text, colour) {
      if (!msg) return;
      msg.style.color = colour;
      msg.textContent = text;
    };
    if (!isValidEmail(email)) { show(t('error.invalid_email'), 'var(--danger)'); return; }

    var rosters = (_clubConfig && _clubConfig.rosters) ? _clubConfig.rosters : {};
    var already = Object.keys(rosters).some(function (k) {
      return ((rosters[k] && rosters[k].playerEmails) || [])
        .some(function (e) { return normalizeEmail(e) === email; });
    });
    if (already) { show(t('error.duplicate_email'), 'var(--danger)'); return; }
    var taken = getUsers().some(function (u) {
      return normalizeEmail(u.email) === email && (u.category || '');
    });
    if (taken) { show(t('reg.pre_already_member'), 'var(--danger)'); return; }

    var next = (((rosters[key] || {}).playerEmails) || []).concat([email]);
    try {
      await saveRoster(session.teamId, key, 'playerEmails', next);
      if (!_clubConfig.rosters) _clubConfig.rosters = {};
      if (!_clubConfig.rosters[key]) _clubConfig.rosters[key] = { staffEmails: [], playerEmails: [] };
      _clubConfig.rosters[key].playerEmails = next;
      inp.value = '';
      renderPage(getSession());
    } catch (err) {
      console.error('addPreRegisteredPlayer failed:', err);
      show(err && err.code === 'permission-denied' ? t('save.error_perms') : t('save.error'),
        'var(--danger)');
    }
  }

  /** Take one address off whichever team list holds it. */
  async function removePreRegisteredPlayer(email, key) {
    var session = getSession();
    var target = normalizeEmail(email);
    if (!session || !session.teamId || !target || !key) return;
    var rosters = (_clubConfig && _clubConfig.rosters) ? _clubConfig.rosters : {};
    var kept = (((rosters[key] || {}).playerEmails) || [])
      .filter(function (e) { return normalizeEmail(e) !== target; });
    try {
      await saveRoster(session.teamId, key, 'playerEmails', kept);
      if (_clubConfig.rosters && _clubConfig.rosters[key]) {
        _clubConfig.rosters[key].playerEmails = kept;
      }
      renderPage(getSession());
    } catch (err) {
      console.error('removePreRegisteredPlayer failed:', err);
      _showPushToast(t('save.sync_title'),
        err && err.code === 'permission-denied' ? t('save.error_perms') : t('save.error'));
    }
  }

  /**
   * Clear the squad assignment of a registered member, locally and in
   * Firestore. Called whenever their address leaves a team's player list —
   * from the ✕ on the pre-registered card or from "Treure de l'equip" — so
   * both routes move the person into the Unassigned block at once instead of
   * waiting on onRosterWritten to come back.
   *
   * Membership itself is untouched: they stay in the club, keep every record,
   * and re-appear in a squad the moment a coach lists their address again.
   */
  async function detachMemberByEmail(email) {
    const target = normalizeEmail(email);
    if (!target) return;
    const users = getUsers();
    const u = users.find(x => normalizeEmail(x.email) === target);
    if (!u || (!u.category && !u.team)) return;
    // Remember where they were so the Unassigned list can offer to put them
    // back. onRosterWritten records the same thing server-side.
    const patch = { category: '', team: '', prevCategory: u.category || '', prevTeam: u.team || '' };
    u.prevCategory = patch.prevCategory;
    u.prevTeam = patch.prevTeam;
    u.category = '';
    u.team = '';
    saveUsers(users);
    if (typeof u.id === 'string' && isNaN(Number(u.id))) {
      try {
        await db.collection('users').doc(u.id).set(patch, { merge: true });
      } catch (err) {
        console.error('detach failed:', err);
        _showPushToast(t('save.sync_title'), t('save.error_perms'));
      }
    }
    if (currentPage === 'registrations') renderPage(getSession());
  }

  /**
   * Put an unassigned member into a squad: add their address to that team's
   * player list (the gate that actually decides membership) and mirror the
   * assignment locally so the row moves at once rather than waiting for
   * onRosterWritten to come back.
   *
   * The category dropdown only offers categories this user may write to —
   * the rules scope playerEmails edits to a coach's own categories, so
   * anything else would fail on save.
   */
  async function assignMemberToTeam(uid, category, letter) {
    const session = getSession();
    if (!session || !session.teamId || !category || !letter) return;
    const users = getUsers();
    const u = users.find(x => String(x.id) === String(uid));
    if (!u) return;
    const email = normalizeEmail(u.email);
    const key = category + '-' + letter;
    try {
      if (email) {
        const rosters = (_clubConfig && _clubConfig.rosters) ? _clubConfig.rosters : {};
        const list = ((rosters[key] || {}).playerEmails) || [];
        if (!list.some(e => normalizeEmail(e) === email)) {
          const next = list.concat([email]);
          await saveRoster(session.teamId, key, 'playerEmails', next);
          if (!_clubConfig.rosters) _clubConfig.rosters = {};
          if (!_clubConfig.rosters[key]) _clubConfig.rosters[key] = { staffEmails: [], playerEmails: [] };
          _clubConfig.rosters[key].playerEmails = next;
        }
      }
      if (typeof uid === 'string' && isNaN(Number(uid))) {
        await db.collection('users').doc(uid).set(
          { category: category, team: letter }, { merge: true });
      }
      u.category = category;
      u.team = letter;
      // Being on a player list IS what makes someone a player, and
      // onRosterWritten has just set that server-side. Mirror it locally or
      // the row keeps whatever stale roles the blob held — db.js's reconcile
      // only ever ADDS missing members, it never refreshes an existing one,
      // so a stale empty array would otherwise persist indefinitely.
      if (!(u.roles || []).includes('player')) {
        u.roles = (u.roles || []).concat(['player']);
      }
      saveUsers(users);
      renderPage(getSession());
    } catch (err) {
      console.error('assign failed:', err);
      _showPushToast(t('save.sync_title'),
        err && err.code === 'permission-denied' ? t('save.error_perms') : t('save.error'));
    }
  }

  // (savePlayerEmailList lived here — it read a whole team's list back out of
  // the DOM on every blur. With the editable rows gone, addPreRegisteredPlayer
  // and removePreRegisteredPlayer write the one address that changed instead.)

  // #region Archived Seasons Viewer
  // ---------- Archived Seasons ----------
  var _archivedSeasonLabel = '';
  var _archiveData = null;
  var _archiveTab = 'matches';
  /* Attendance answers, {uid}_{date} -> value, fetched separately and only
     when that tab is opened: a season holds one per player per session,
     a few thousand documents, and three of the four tabs never touch them.
     null means "not fetched yet", {} means "fetched and empty". */
  var _archiveAvail = null;
  var _archiveAvailLoading = false;

  // Load list of archived seasons from Firestore
  async function loadArchivedSeasons(teamId) {
    try {
      var snap = await db.collection('teams').doc(teamId).collection('seasons').get();
      var seasons = [];
      snap.forEach(function(d) { seasons.push({ id: d.id, label: d.data().label || d.id, archivedAt: d.data().archivedAt, archivedBy: d.data().archivedBy }); });
      // Sort by label descending
      seasons.sort(function(a, b) { return b.label.localeCompare(a.label); });
      return seasons;
    } catch (e) { console.error('loadArchivedSeasons error:', e); return []; }
  }

  /* One archive document → its value. Blob format is {v:"<json>"}; the
     merge-shape keys store entries as top-level fields instead.
     `category` is dropped with `_migrated`: it is the router's bookkeeping,
     and leaving it in put a phantom "category" entry among the player ids
     of every merge-shape map. */
  function parseArchiveDoc(raw) {
    if (!raw) return null;
    if (raw.v !== undefined) {
      try { return JSON.parse(raw.v); } catch (e) { return raw.v; }
    }
    var obj = {};
    for (var k in raw) {
      if (k !== '_migrated' && k !== 'category') obj[k] = raw[k];
    }
    return obj;
  }

  /**
   * Raw archive documents → the one blob per key every render function reads.
   *
   * TWO id formats have to work, permanently:
   *   fa_matches__amateur   sharded, written since Phase 5
   *   fa_matches            flat, written BEFORE it
   *
   * The flat form is not a transitional artefact here. db.js's live loader
   * drops legacy ids because Stage E wiped them club-wide — but a season
   * archived before the migration keeps that shape for ever, so this must
   * read both or every old season stays unreadable.
   *
   * Sharded keys are reassembled with Shard.merge, the same function the
   * live loader uses, so an archived blob comes out byte-identical to what
   * the app held while that season was current. Indexing by the raw doc id
   * — which is what this used to do — meant `data.fa_matches` was simply
   * absent, and every consumer's `|| []` fallback turned a full season into
   * an empty one without a single error.
   */
  function groupArchivedDocs(docs) {
    var out = {};
    var shards = {};
    (docs || []).forEach(function (d) {
      var value = parseArchiveDoc(d.data);
      var parts = Shard.parseDocId(d.id);
      // Legacy flat id, or a sharded key the router does not know: keep it
      // under its own id. merge() would throw on an unrouted key, and
      // guessing a base key for it could silently drop a sibling shard.
      if (!parts || !Shard.isSharded(parts.key)) { out[d.id] = value; return; }
      (shards[parts.key] || (shards[parts.key] = {}))[parts.cat] = value;
    });
    Object.keys(shards).forEach(function (key) {
      out[key] = Shard.merge(key, shards[key]);
    });
    return out;
  }

  // Load all data docs for a specific archived season
  async function loadSeasonData(teamId, label) {
    try {
      var snap = await db.collection('teams').doc(teamId).collection('seasons').doc(label).collection('data').get();
      var docs = [];
      snap.forEach(function (d) { docs.push({ id: d.id, data: d.data() }); });
      return groupArchivedDocs(docs);
    } catch (e) { console.error('loadSeasonData error:', e); return null; }
  }

  /* Attendance and RPE are NOT in the archive's data/ collection. They were
     moved to per-record collections in Phase 3b and archived from there, so
     `fa_training_availability` has not been written for a season since.
     Same {uid}_{date} doc ids and the same toEntry() mapping the live
     listener uses — one definition, exported from db.js. */
  async function loadArchivedRecords(teamId, label, coll) {
    try {
      var cfg = (DB.RECORD_COLLECTIONS || {})[coll];
      if (!cfg) return {};
      var snap = await db.collection('teams').doc(teamId)
        .collection('seasons').doc(label).collection(coll).get();
      var out = {};
      snap.forEach(function (d) { out[d.id] = cfg.toEntry(d.data()); });
      return out;
    } catch (e) { console.error('loadArchivedRecords error:', coll, e); return {}; }
  }

  // Aggregate player stats from archived match events
  function aggregateArchivedStats(data) {
    var matches = data.fa_matches || [];
    var allEvents = data.fa_match_events || {};
    var users = data.fa_users || getUsers();
    var players = {};

    // Init players
    (Array.isArray(users) ? users : []).forEach(function(u) {
      if (!u.roles || !u.roles.includes('player')) return;
      players[u.id] = { name: u.name || u.id, goals: 0, assists: 0, yellows: 0, reds: 0, minutes: 0, matches: 0 };
    });

    var totalGoalsFor = 0, totalGoalsAgainst = 0, wins = 0, draws = 0, losses = 0;

    matches.forEach(function(m) {
      if (m.status !== 'played') return;
      var events = allEvents[m.id] || [];
      var sc = { home: 0, away: 0 };
      events.forEach(function(e) {
        if (e.type === 'goal') { if (e.side === 'home') sc.home++; else sc.away++; }
        if (e.type === 'own_goal') { if (e.side === 'home') sc.away++; else sc.home++; }
      });

      // Determine if home or away
      var weAreHome = isOurTeam(m.home);
      var ourGoals = weAreHome ? sc.home : sc.away;
      var theirGoals = weAreHome ? sc.away : sc.home;
      totalGoalsFor += ourGoals;
      totalGoalsAgainst += theirGoals;
      if (ourGoals > theirGoals) wins++;
      else if (ourGoals < theirGoals) losses++;
      else draws++;

      // Per-player stats
      events.forEach(function(e) {
        var pid = e.playerId || e.playerNumber;
        if (!pid) return;
        if (!players[pid]) players[pid] = { name: pid, goals: 0, assists: 0, yellows: 0, reds: 0, minutes: 0, matches: 0 };
        if (e.type === 'goal') players[pid].goals++;
        if (e.type === 'yellow') players[pid].yellows++;
        if (e.type === 'red') players[pid].reds++;
        // Assists
        var assistId = e.assistPlayerId || e.assister;
        if (e.type === 'goal' && assistId) {
          if (!players[assistId]) players[assistId] = { name: assistId, goals: 0, assists: 0, yellows: 0, reds: 0, minutes: 0, matches: 0 };
          players[assistId].assists++;
        }
      });
    });

    // Convert to sorted array
    var arr = Object.keys(players).map(function(id) { return players[id]; });
    arr.sort(function(a, b) { return b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name); });

    return {
      players: arr,
      matchesPlayed: matches.filter(function(m) { return m.status === 'played'; }).length,
      totalGoalsFor: totalGoalsFor, totalGoalsAgainst: totalGoalsAgainst,
      wins: wins, draws: draws, losses: losses
    };
  }

  // Aggregate attendance from archived training data
  /* `avail` is passed in rather than read off `data`: it does not live in
     the archive's data/ collection at all. fa_training_availability was
     dropped from the server's SEASON_KEYS when the canonical records moved
     to their own collection, so reading it here returned {} for every
     archived season and every player showed 0% attendance. */
  function aggregateArchivedAttendance(data, avail) {
    var training = data.fa_training || [];
    avail = avail || {};
    var users = data.fa_users || getUsers();
    var playerList = (Array.isArray(users) ? users : []).filter(function(u) { return u.roles && u.roles.includes('player'); });
    var pastTrainings = training.filter(function(t) { return t.status === 'past' || t.date < new Date().toISOString().slice(0, 10); });

    var result = [];
    playerList.forEach(function(u) {
      var yes = 0, late = 0, no = 0, injured = 0;
      pastTrainings.forEach(function(tr) {
        var key = recordKey(u.id, tr, 'avail');
        var answer = avail[key] || '';
        if (answer === 'yes') yes++;
        else if (answer === 'late') late++;
        else if (answer === 'injured') injured++;
        else no++;
      });
      var total = yes + late + no + injured;
      var pct = total > 0 ? Math.round(((yes + late) / total) * 100) : 0;
      result.push({ name: u.name, yes: yes, late: late, no: no, injured: injured, pct: pct });
    });

    result.sort(function(a, b) { return b.pct - a.pct; });
    return { players: result, totalTrainings: pastTrainings.length };
  }

  // Render archived seasons list page
  function renderArchivedSeasons() {
    var html = '<a class="detail-back" onclick="window._navTo(\'settings\')">' + t('btn.back') + '</a>';
    html += '<h2 class="page-title">' + t('archive.title') + '</h2>';
    html += '<div id="archived-seasons-list"><p style="color:var(--text-secondary);font-size:.9rem;">' + t('archive.loading') + '</p></div>';
    // Load async
    var session = getSession();
    if (session && session.teamId) {
      loadArchivedSeasons(session.teamId).then(function(seasons) {
        var el = document.getElementById('archived-seasons-list');
        if (!el) return;
        if (!seasons.length) {
          el.innerHTML = '<div class="card"><p style="color:var(--text-secondary);text-align:center;padding:2rem 0;">' + t('archive.no_seasons') + '</p></div>';
          return;
        }
        var cards = '';
        seasons.forEach(function(s) {
          var dateStr = '';
          if (s.archivedAt && s.archivedAt.toDate) {
            var d = s.archivedAt.toDate();
            dateStr = t('archive.archived_on') + ' ' + d.toLocaleDateString(_lang === 'en' ? 'en-GB' : _lang === 'es' ? 'es-ES' : 'ca-ES', { day: 'numeric', month: 'long', year: 'numeric' });
          }
          cards += '<div class="card" style="display:flex;align-items:center;justify-content:space-between;">' +
            '<div><div style="font-weight:700;font-size:1.1rem;letter-spacing:.05em;">' + sanitize(s.label) + '</div>' +
            (dateStr ? '<div style="font-size:.8rem;color:var(--text-secondary);margin-top:.2rem;">' + dateStr + '</div>' : '') +
            '</div>' +
            '<button class="btn btn-small btn-primary btn-view-season" data-label="' + sanitize(s.id) + '">' + t('archive.view') + '</button>' +
            '</div>';
        });
        el.innerHTML = cards;
        // Bind click
        el.querySelectorAll('.btn-view-season').forEach(function(btn) {
          btn.addEventListener('click', function() {
            _archivedSeasonLabel = btn.dataset.label;
            _archiveData = null;
            _archiveAvail = null;
            _archiveAvailLoading = false;
            _archiveTab = 'matches';
            currentPage = 'archived-season-detail';
            renderPage(getSession());
          });
        });
      });
    }
    return html;
  }

  // Render archived season detail with 4 tabs
  function renderArchivedSeasonDetail() {
    var label = _archivedSeasonLabel || '?';
    var html = '<a class="detail-back" onclick="_archivedSeasonLabel=\'\';currentPage=\'archived-seasons\';renderPage(getSession())">' + t('btn.back') + '</a>';
    html += '<div style="display:flex;align-items:center;gap:.6rem;margin-bottom:1rem;">' +
      '<span style="background:var(--text-secondary);color:#fff;padding:.2rem .6rem;border-radius:6px;font-size:.7rem;font-weight:700;letter-spacing:.05em;">' + t('archive.archived_on').replace(/ .*/, '').toUpperCase() + '</span>' +
      '<span style="font-size:1.3rem;font-weight:800;letter-spacing:.05em;">' + sanitize(label) + '</span></div>';
    html += '<div id="archive-content"><p style="color:var(--text-secondary);font-size:.9rem;">' + t('archive.loading') + '</p></div>';

    // Load data async
    var session = getSession();
    if (session && session.teamId) {
      var loadFn = _archiveData ? Promise.resolve(_archiveData) : loadSeasonData(session.teamId, label);
      loadFn.then(function(data) {
        if (!data) return;
        _archiveData = data;
        var el = document.getElementById('archive-content');
        if (!el) return;
        el.innerHTML = renderArchiveTabs(data);
        bindArchiveTabs();
      });
    }
    return html;
  }

  function renderArchiveTabs(data) {
    var stats = aggregateArchivedStats(data);
    var attendance = aggregateArchivedAttendance(data, _archiveAvail);
    var injuries = data.fa_injuries || [];
    var training = data.fa_training || [];
    var matches = data.fa_matches || [];
    var playedCount = matches.filter(function(m) { return m.status === 'played'; }).length;
    var playerCount = stats.players.length;
    var trainingCount = attendance.totalTrainings;

    // Summary grid
    var html = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem;margin-bottom:1rem;">';
    html += '<div class="card" style="text-align:center;padding:.8rem .4rem;margin-bottom:0;"><div style="font-size:1.4rem;font-weight:800;color:var(--primary);">' + playedCount + '</div><div style="font-size:.68rem;color:var(--text-secondary);font-weight:600;text-transform:uppercase;">' + t('archive.matches') + '</div></div>';
    html += '<div class="card" style="text-align:center;padding:.8rem .4rem;margin-bottom:0;"><div style="font-size:1.4rem;font-weight:800;color:var(--success);">' + stats.totalGoalsFor + '</div><div style="font-size:.68rem;color:var(--text-secondary);font-weight:600;text-transform:uppercase;">' + t('ev.goal') + '</div></div>';
    html += '<div class="card" style="text-align:center;padding:.8rem .4rem;margin-bottom:0;"><div style="font-size:1.4rem;font-weight:800;color:var(--primary);">' + trainingCount + '</div><div style="font-size:.68rem;color:var(--text-secondary);font-weight:600;text-transform:uppercase;">' + t('archive.trainings') + '</div></div>';
    html += '<div class="card" style="text-align:center;padding:.8rem .4rem;margin-bottom:0;"><div style="font-size:1.4rem;font-weight:800;color:var(--primary);">' + playerCount + '</div><div style="font-size:.68rem;color:var(--text-secondary);font-weight:600;text-transform:uppercase;">' + t('archive.players') + '</div></div>';
    html += '</div>';

    // Tabs
    var tabs = ['matches', 'stats', 'attendance', 'injuries'];
    var tabLabels = { matches: t('archive.matches'), stats: t('archive.stats'), attendance: t('archive.attendance'), injuries: t('archive.injuries') };
    html += '<div style="display:flex;background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow);margin-bottom:1rem;overflow:hidden;">';
    tabs.forEach(function(tab) {
      var active = tab === _archiveTab;
      html += '<div class="archive-tab" data-tab="' + tab + '" style="flex:1;padding:.65rem .4rem;text-align:center;font-size:.8rem;font-weight:600;cursor:pointer;border-bottom:3px solid ' + (active ? 'var(--primary)' : 'transparent') + ';color:' + (active ? 'var(--primary)' : 'var(--text-secondary)') + ';' + (active ? 'background:var(--danger-light);' : '') + '">' + tabLabels[tab] + '</div>';
    });
    html += '</div>';

    // Tab content
    if (_archiveTab === 'matches') html += renderArchiveMatches(data, stats);
    else if (_archiveTab === 'stats') html += renderArchiveStats(stats);
    else if (_archiveTab === 'attendance') html += renderArchiveAttendance(attendance, _archiveAvail !== null);
    else if (_archiveTab === 'injuries') html += renderArchiveInjuries(injuries);

    return html;
  }

  function renderArchiveMatches(data, stats) {
    var matches = (data.fa_matches || []).filter(function(m) { return m.status === 'played'; });
    var allEvents = data.fa_match_events || {};
    if (!matches.length) return '<div class="card"><p style="color:var(--text-secondary);text-align:center;">' + t('archive.no_seasons') + '</p></div>';

    var html = '<div class="card" style="padding:.4rem .8rem;">';
    matches.forEach(function(m) {
      var events = allEvents[m.id] || [];
      var sc = { home: 0, away: 0 };
      events.forEach(function(e) {
        if (e.type === 'goal') { if (e.side === 'home') sc.home++; else sc.away++; }
        if (e.type === 'own_goal') { if (e.side === 'home') sc.away++; else sc.home++; }
      });
      // Fallback to stored score
      if (!events.length && m.score) {
        var parts = String(m.score).split('-');
        sc.home = Number(parts[0]) || 0;
        sc.away = Number(parts[1]) || 0;
      }
      var weAreHome = isOurTeam(m.home);
      var ourGoals = weAreHome ? sc.home : sc.away;
      var theirGoals = weAreHome ? sc.away : sc.home;
      var cls = ourGoals > theirGoals ? 'color:var(--success)' : ourGoals < theirGoals ? 'color:var(--danger)' : 'color:var(--warning)';
      var dateStr = m.date ? m.date.split('-').reverse().join('/') : '';
      html += '<div style="display:flex;align-items:center;padding:.65rem 0;border-bottom:1px solid var(--border);">' +
        '<div style="font-size:.72rem;color:var(--text-secondary);width:62px;flex-shrink:0;">' + dateStr + '</div>' +
        '<div style="flex:1;font-weight:600;font-size:.85rem;">' + sanitize(m.home) + ' vs ' + sanitize(m.away) + '</div>' +
        '<div style="font-weight:800;font-size:1rem;min-width:50px;text-align:center;' + cls + '">' + sc.home + ' - ' + sc.away + '</div>' +
        '</div>';
    });
    html += '</div>';
    return html;
  }

  function renderArchiveStats(stats) {
    var html = '<div class="card"><div class="card-title" style="font-size:.95rem;">' + t('archive.stats') + '</div>';
    html += '<div class="table-wrap"><table style="font-size:.83rem;"><thead><tr><th>' + t('reg.th_name') + '</th>' +
      '<th style="text-align:center;"><img src="img/gol.png" style="width:16px;height:16px;" alt="gol"></th>' +
      '<th style="text-align:center;"><img src="img/assist.png" style="width:16px;height:16px;" alt="assist"></th>' +
      '<th style="text-align:center;"><img src="img/groga.png" style="width:16px;height:16px;" alt="groga"></th>' +
      '<th style="text-align:center;"><img src="img/vermella.png" style="width:16px;height:16px;" alt="vermella"></th>' +
      '</tr></thead><tbody>';
    stats.players.forEach(function(p) {
      html += '<tr><td style="font-weight:600;">' + sanitize(p.name) + '</td>' +
        '<td style="text-align:center;">' + p.goals + '</td>' +
        '<td style="text-align:center;">' + p.assists + '</td>' +
        '<td style="text-align:center;">' + p.yellows + '</td>' +
        '<td style="text-align:center;">' + p.reds + '</td></tr>';
    });
    html += '</tbody></table></div></div>';

    // Season summary
    html += '<div class="card"><div class="card-title" style="font-size:.95rem;">' + t('archive.season_summary') + '</div>';
    html += '<div style="display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid var(--border);"><span style="font-weight:600;">' + t('archive.wins') + '</span><span style="font-weight:700;color:var(--success);">' + stats.wins + '</span></div>';
    html += '<div style="display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid var(--border);"><span style="font-weight:600;">' + t('archive.draws') + '</span><span style="font-weight:700;color:var(--warning);">' + stats.draws + '</span></div>';
    html += '<div style="display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid var(--border);"><span style="font-weight:600;">' + t('archive.losses') + '</span><span style="font-weight:700;color:var(--danger);">' + stats.losses + '</span></div>';
    html += '<div style="display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid var(--border);"><span style="font-weight:600;">' + t('archive.goals_for') + '</span><span style="font-weight:700;color:var(--success);">' + stats.totalGoalsFor + '</span></div>';
    html += '<div style="display:flex;justify-content:space-between;padding:.4rem 0;"><span style="font-weight:600;">' + t('archive.goals_against') + '</span><span style="font-weight:700;color:var(--danger);">' + stats.totalGoalsAgainst + '</span></div>';
    html += '</div>';
    return html;
  }

  function renderArchiveAttendance(att, loaded) {
    var html = '<div class="card"><div class="card-title" style="font-size:.95rem;">' + t('archive.attendance') + '</div>';
    // Percentages would all read 0% until the records arrive, which looks
    // like an answer rather than a wait.
    if (!loaded) {
      return html + '<p style="color:var(--text-secondary);font-size:.9rem;">' +
        t('archive.loading') + '</p></div>';
    }
    html += '<div class="table-wrap"><table style="font-size:.83rem;"><thead><tr><th>' + t('reg.th_name') + '</th>' +
      '<th style="text-align:center;">' + t('archive.present') + '</th>' +
      '<th style="text-align:center;">' + t('archive.late') + '</th>' +
      '<th style="text-align:center;">' + t('archive.absent') + '</th>' +
      '<th style="width:100px;">%</th></tr></thead><tbody>';
    att.players.forEach(function(p) {
      var barColor = p.pct >= 80 ? 'var(--success)' : p.pct >= 60 ? 'var(--warning)' : 'var(--danger)';
      var pctColor = p.pct >= 80 ? 'var(--success)' : p.pct >= 60 ? 'var(--warning)' : 'var(--danger)';
      html += '<tr><td style="font-weight:600;">' + sanitize(p.name) + '</td>' +
        '<td style="text-align:center;">' + p.yes + '</td>' +
        '<td style="text-align:center;">' + p.late + '</td>' +
        '<td style="text-align:center;">' + p.no + '</td>' +
        '<td><div style="height:6px;border-radius:3px;background:var(--border);overflow:hidden;"><div style="height:100%;border-radius:3px;background:' + barColor + ';width:' + p.pct + '%;"></div></div>' +
        '<span style="font-size:.7rem;color:' + pctColor + ';font-weight:700;">' + p.pct + '%</span></td></tr>';
    });
    html += '</tbody></table></div></div>';

    // Summary
    if (att.totalTrainings > 0) {
      var avgPct = att.players.length > 0 ? Math.round(att.players.reduce(function(s, p) { return s + p.pct; }, 0) / att.players.length) : 0;
      html += '<div class="card"><div class="card-title" style="font-size:.95rem;">' + t('archive.season_summary') + '</div>';
      html += '<div style="display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid var(--border);"><span style="font-weight:600;">' + t('archive.trainings') + '</span><span style="font-weight:700;color:var(--primary);">' + att.totalTrainings + '</span></div>';
      html += '<div style="display:flex;justify-content:space-between;padding:.4rem 0;"><span style="font-weight:600;">' + t('archive.avg_attendance') + '</span><span style="font-weight:700;color:var(--success);">' + avgPct + '%</span></div>';
      html += '</div>';
    }
    return html;
  }

  function renderArchiveInjuries(injuries) {
    if (!injuries.length) return '<div class="card"><p style="color:var(--text-secondary);text-align:center;padding:1.5rem 0;">' + t('archive.no_seasons') + '</p></div>';

    var html = '<div class="card"><div class="card-title" style="font-size:.95rem;">' + t('archive.injuries') + '</div>';
    html += '<div class="table-wrap"><table style="font-size:.83rem;"><thead><tr><th>' + t('reg.th_name') + '</th><th>' + t('injury_log.area') + '</th><th>' + t('injury_log.severity') + '</th><th>' + t('injury_log.start_date') + '</th><th style="text-align:center;">' + t('archive.days_out') + '</th></tr></thead><tbody>';

    var totalDays = 0, minor = 0, moderate = 0, severe = 0;
    // Get player names from users
    var users = {};
    (getUsers() || []).forEach(function(u) { users[u.id] = u.name; });

    injuries.forEach(function(inj) {
      var playerName = users[inj.playerId] || inj.playerId || '?';
      var zone = inj.muscleGroup || inj.bodyZoneLabel || '';
      var sevClass = inj.severity === 'minor' ? 'background:var(--success-light);color:var(--success)' : inj.severity === 'moderate' ? 'background:#fff3e0;color:var(--warning)' : 'background:var(--danger-light);color:var(--danger)';
      var sevLabel = inj.severity === 'minor' ? t('medical.severity_minor') : inj.severity === 'moderate' ? t('medical.severity_moderate') : t('medical.severity_severe');
      var days = 0;
      if (inj.startDate && inj.endDate) {
        days = Math.max(0, Math.round((new Date(inj.endDate) - new Date(inj.startDate)) / 86400000));
      } else if (inj.startDate) {
        days = Math.max(0, Math.round((new Date() - new Date(inj.startDate)) / 86400000));
      }
      totalDays += days;
      if (inj.severity === 'minor') minor++;
      else if (inj.severity === 'moderate') moderate++;
      else severe++;

      var dateStr = inj.startDate ? inj.startDate.split('-').reverse().join('/') : '';
      html += '<tr><td style="font-weight:600;">' + sanitize(playerName) + '</td>' +
        '<td>' + sanitize(zone) + '</td>' +
        '<td><span style="' + sevClass + ';padding:.15rem .5rem;border-radius:4px;font-size:.72rem;font-weight:600;">' + sevLabel + '</span></td>' +
        '<td>' + dateStr + '</td>' +
        '<td style="text-align:center;">' + days + '</td></tr>';
    });
    html += '</tbody></table></div></div>';

    // Summary
    html += '<div class="card"><div class="card-title" style="font-size:.95rem;">' + t('archive.season_summary') + '</div>';
    html += '<div style="display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid var(--border);"><span style="font-weight:600;">' + t('archive.total_injuries') + '</span><span style="font-weight:700;color:var(--primary);">' + injuries.length + '</span></div>';
    html += '<div style="display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid var(--border);"><span style="font-weight:600;">' + t('medical.severity_minor') + '</span><span style="font-weight:700;color:var(--success);">' + minor + '</span></div>';
    html += '<div style="display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid var(--border);"><span style="font-weight:600;">' + t('medical.severity_moderate') + '</span><span style="font-weight:700;color:var(--warning);">' + moderate + '</span></div>';
    html += '<div style="display:flex;justify-content:space-between;padding:.4rem 0;border-bottom:1px solid var(--border);"><span style="font-weight:600;">' + t('medical.severity_severe') + '</span><span style="font-weight:700;color:var(--danger);">' + severe + '</span></div>';
    html += '<div style="display:flex;justify-content:space-between;padding:.4rem 0;"><span style="font-weight:600;">' + t('archive.total_days_lost') + '</span><span style="font-weight:700;color:var(--danger);">' + totalDays + '</span></div>';
    html += '</div>';
    return html;
  }

  function bindArchiveTabs() {
    document.querySelectorAll('.archive-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        _archiveTab = tab.dataset.tab;
        rerenderArchive();
      });
    });
    maybeLoadArchiveAttendance();
  }

  function rerenderArchive() {
    var el = document.getElementById('archive-content');
    if (!el || !_archiveData) return;
    el.innerHTML = renderArchiveTabs(_archiveData);
    bindArchiveTabs();
  }

  /* Runs after every archive render, so it covers both opening straight
     onto the tab and switching to it. The loading flag matters because
     bindArchiveTabs re-runs on each render, including the one this fetch
     triggers itself. */
  function maybeLoadArchiveAttendance() {
    if (_archiveTab !== 'attendance') return;
    if (_archiveAvail !== null || _archiveAvailLoading) return;
    var session = getSession();
    if (!session || !session.teamId || !_archivedSeasonLabel) return;
    _archiveAvailLoading = true;
    var label = _archivedSeasonLabel;
    loadArchivedRecords(session.teamId, label, 'trainingAvail').then(function (avail) {
      _archiveAvailLoading = false;
      // The user may have gone back and opened a different season while
      // this was in flight; that season's fetch owns the state now.
      if (label !== _archivedSeasonLabel) return;
      _archiveAvail = avail;
      rerenderArchive();
    });
  }

  // Expose navigation helper for back buttons
  window._navTo = function(page) { currentPage = page; renderPage(getSession()); };
  // #endregion Archived Seasons Viewer

  function renderAdminSettings() {
    const session = getSession();
    let html = '<h2 class="page-title">' + t('page.settings') + '</h2>';

    // ---------- Team Lead / Admin: Category Config ----------
    if (session && (session.isTeamLead || session.isAdmin)) {
      var hasCfg = !!_clubConfig;
      html += `
      <div class="card">
        <div class="card-title">Configuració de Categories</div>
        ${hasCfg
          ? '<p style="color:var(--text-secondary);font-size:.9rem;margin-bottom:.8rem;">Modifica les categories, equips i enllaços classificació FCF del club.</p><button class="btn btn-primary" id="btn-edit-categories">Editar categories</button>'
          : '<p style="color:var(--text-secondary);font-size:.9rem;">No estàs vinculat a cap club. Contacta l\'administrador.</p>'
        }
      </div>`;
    }

    // ---------- Team Lead / Admin: New Season ----------
    if (session && (session.isTeamLead || session.isAdmin)) {
      html += `
      <div class="card">
        <div class="card-title">${t('settings.new_season')}</div>
        <p style="margin-bottom:1rem;color:var(--text-secondary);font-size:.9rem;">${t('settings.new_season_desc')}</p>
        <button class="btn btn-danger" id="btn-new-season">${t('settings.new_season_btn')}</button>
        <div id="new-season-result" style="margin-top:.6rem;" hidden></div>
      </div>`;
    }

    // ---------- Team Lead / Admin: Archived Seasons ----------
    if (session && (session.isTeamLead || session.isAdmin)) {
      html += `
      <div class="card">
        <div class="card-title">${t('settings.archived_seasons')}</div>
        <p style="margin-bottom:1rem;color:var(--text-secondary);font-size:.9rem;">${t('settings.archived_seasons_desc')}</p>
        <button class="btn btn-primary" id="btn-archived-seasons">${t('archive.view')}</button>
      </div>`;
    }

    // ---------- Admin: Club Management ----------
    if (session && session.isAdmin) {
      html += `
      <div class="card">
        <div class="card-title">Gestió de Clubs</div>
        <div id="club-list" style="margin-bottom:1.2rem;">
          <p style="color:var(--text-secondary);font-size:.9rem;">Carregant clubs…</p>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:1rem;">
          <div class="card-title" style="font-size:.95rem;">Crear nou club</div>
          <div class="form-group" style="margin-bottom:.6rem;">
            <label for="new-club-name">Nom del club</label>
            <input type="text" id="new-club-name" placeholder="CF Exemple" required>
          </div>
          <div class="form-group" style="margin-bottom:.6rem;">
            <label for="new-club-email">Email del Team Lead</label>
            <input type="email" id="new-club-email" placeholder="lead@example.com" required>
          </div>
          <div class="form-group" style="margin-bottom:.8rem;">
            <label for="new-club-badge">Escut del club (PNG)</label>
            <input type="file" id="new-club-badge" accept="image/png">
          </div>
          <button class="btn btn-primary" id="btn-create-club">Crear Club</button>
          <div id="create-club-result" style="margin-top:.6rem;" hidden></div>
        </div>
      </div>`;
    }

    return html;
  }

  // Load and render club list in settings
  async function _loadClubList() {
    const listEl = document.getElementById('club-list');
    if (!listEl) return;
    try {
      const snap = await db.collection('clubs').get();
      if (snap.empty) {
        listEl.innerHTML = '<p style="color:var(--text-secondary);font-size:.9rem;">Cap club creat encara.</p>';
        return;
      }
      // Join codes live in clubCodes/{CODE} → {clubId} (superuser-readable only)
      const codeByClub = {};
      try {
        const codesSnap = await db.collection('clubCodes').get();
        codesSnap.forEach(cd => { codeByClub[cd.data().clubId] = cd.id; });
      } catch (codeErr) { console.warn('Could not load club codes:', codeErr); }
      let rows = '';
      snap.forEach(d => {
        const c = d.data();
        const code = codeByClub[d.id] || '—';
        // The crest is click-to-replace: storage.rules already restricts
        // clubBadges writes to the superuser, and this table is superuser-only.
        const badgeImg = c.badgeUrl
          ? `<img src="${c.badgeUrl}" class="club-badge-edit" data-club="${d.id}" title="${t('club.change_badge')}">`
          : `<span class="club-badge-edit club-badge-empty" data-club="${d.id}" title="${t('club.change_badge')}">+</span>`;
        rows += `<tr>
          <td>${badgeImg}${sanitize(c.name)}</td>
          <td style="font-family:monospace;letter-spacing:.1em;font-weight:600;">${code}</td>
          <td>
            <input type="email" class="reg-input club-lead-input" data-club="${d.id}"
                   data-orig="${sanitize(c.leadEmail || '')}" value="${sanitize(c.leadEmail || '')}"
                   style="min-width:200px;font-size:.82rem;">
            <div class="club-lead-msg" data-club="${d.id}" style="font-size:.78rem;margin-top:.2rem;"></div>
          </td>
          <td style="white-space:nowrap;">
            <input type="number" min="0" class="reg-input club-minver-input" data-club="${d.id}"
                   value="${Number(c.minAppVersion || 0)}" title="${t('club.min_version')}"
                   style="width:70px;font-size:.82rem;">
          </td>
          <td style="white-space:nowrap;">
            <input type="number" min="1" class="reg-input club-maxteams-input" data-club="${d.id}"
                   data-teams="${rosterKeys(c).length}"
                   value="${Math.max(1, Number(c.maxTeams || 1))}" title="${t('quota.max_teams')}"
                   style="width:70px;font-size:.82rem;">
          </td>
          <td style="white-space:nowrap;">
            <button class="btn btn-small btn-outline btn-copy-code" data-code="${code}" title="Copiar codi">📋</button>
            <button class="btn btn-small btn-primary btn-save-lead" data-club="${d.id}" title="${t('club.change_lead')}" disabled>💾</button>
          </td>
        </tr>`;
      });
      listEl.innerHTML = `<table class="table" style="font-size:.85rem;">
        <thead><tr><th>Club</th><th>Codi</th><th>Team Lead</th><th>${t('club.min_version')}</th><th>${t('quota.max_teams')}</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
      // Look the address up as it is typed. Bound here rather than in the
      // delegated handler because this table is rendered asynchronously.
      listEl.querySelectorAll('.club-lead-input').forEach(function (inp) {
        var timer = null;
        inp.addEventListener('input', function () {
          clearTimeout(timer);
          timer = setTimeout(function () { _checkLeadEmail(inp.dataset.club); }, 350);
        });
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); _saveLeadEmail(inp.dataset.club); }
        });
      });
      // Minimum app version: saved on blur, no confirmation — it only drives
      // a dismissable banner, so a wrong value costs nothing but noise.
      /* Team allowance. Superadmin-only by rule: this is the commercial
         limit, and it is the one field a lead must not be able to move.
         Lowering it below a club's current count is allowed and warns —
         until deploy 2 ships the delete flow, an over-quota lead has no way
         to resolve it, so the warning is not decorative. */
      listEl.querySelectorAll('.club-maxteams-input').forEach(function (inp) {
        inp.addEventListener('change', function () {
          var v = Math.max(1, Math.floor(Number(inp.value) || 1));
          inp.value = v;
          var have = Number(inp.dataset.teams || 0);
          updateClub(inp.dataset.club, { maxTeams: v })
            .then(function () {
              _showPushToast(t('quota.max_teams'),
                v < have ? t('quota.counter').replace('{n}', have).replace('{max}', v)
                         : t('quota.saved'));
            })
            .catch(function (err) {
              console.error('maxTeams save failed:', err);
              _showPushToast(t('save.sync_title'), t('save.error'));
            });
        });
      });
      listEl.querySelectorAll('.club-minver-input').forEach(function (inp) {
        inp.addEventListener('change', function () {
          var v = Math.max(0, Number(inp.value) || 0);
          updateClub(inp.dataset.club, { minAppVersion: v })
            .then(function () { _showPushToast(t('club.min_version'), 'v' + v); })
            .catch(function (err) {
              console.error('minAppVersion save failed:', err);
              _showPushToast(t('save.sync_title'), t('save.error'));
            });
        });
      });
    } catch (e) {
      listEl.innerHTML = '<p style="color:var(--danger);">Error carregant clubs.</p>';
      console.error(e);
    }
  }

  /* Team-lead field in the club table (superadmin only).
     The handover itself is the onClubLeadChanged trigger — this only writes
     clubs/{id}.leadEmail. What it adds is a look-up as you type, so you save
     knowing whether the address belongs to an existing member or to nobody
     yet: a typo leaves the club with no working lead and only you can fix it. */
  async function _checkLeadEmail(clubId) {
    const inp = document.querySelector('.club-lead-input[data-club="' + clubId + '"]');
    const msg = document.querySelector('.club-lead-msg[data-club="' + clubId + '"]');
    const btn = document.querySelector('.btn-save-lead[data-club="' + clubId + '"]');
    if (!inp || !msg || !btn) return;
    const email = normalizeEmail(inp.value);
    const orig = normalizeEmail(inp.dataset.orig);
    btn.disabled = true;
    if (!email) { msg.textContent = ''; return; }
    if (!isValidEmail(email)) {                    // malformed
      msg.style.color = 'var(--danger)';
      msg.textContent = t('error.invalid_email');
      return;
    }
    if (email === orig) {                          // unchanged
      msg.style.color = 'var(--text-secondary)';
      msg.textContent = t('club.lead_unchanged');
      return;
    }
    try {
      const snap = await db.collection('users')
        .where('teamId', '==', clubId).where('email', '==', email).limit(1).get();
      if (snap.empty) {
        // Legal — they may simply not have signed up yet — but by far the
        // likeliest cause is a typo, so say so rather than silently allowing.
        msg.style.color = '#f9a825';
        msg.textContent = t('club.lead_not_registered');
      } else {
        const u = snap.docs[0].data();
        const bits = (u.roles || []).filter(r => r !== 'lead').join(', ') || t('reg.status_none');
        msg.style.color = 'var(--primary)';
        msg.textContent = t('club.lead_found')
          .replace('{name}', u.name || email).replace('{roles}', bits);
      }
      btn.disabled = false;
    } catch (err) {
      console.error('lead lookup failed:', err);
      msg.style.color = 'var(--danger)';
      msg.textContent = t('save.error');
    }
  }

  /**
   * Replace a club's crest (superuser only — storage.rules enforces it).
   * Uploaded under the club id, so a club has one badge whatever its history.
   * If the extension differs from the previous upload the old file is left
   * behind; harmless, and clubBadges has no listing permission from a client.
   */
  async function changeClubBadge(clubId, file) {
    if (!clubId || !file) return;
    if (!/^image\//.test(file.type)) {
      _showPushToast(t('club.change_badge'), t('club.badge_not_image'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {   // matches the storage rule
      _showPushToast(t('club.change_badge'), t('club.badge_too_big'));
      return;
    }
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const ref = storage.ref('clubBadges/' + clubId + '.' + ext);
      await ref.put(file);
      const badgeUrl = await ref.getDownloadURL();
      await updateClub(clubId, { badgeUrl: badgeUrl });
      // Our own club's crest is cached for the splash screen; drop it so the
      // new one is picked up rather than the old base64 copy.
      const session = getSession();
      if (session && session.teamId === clubId) {
        localStorage.removeItem('_splash_badge');
        localStorage.removeItem('_splash_badge_url');
        if (_clubConfig) _clubConfig.badgeUrl = badgeUrl;
      }
      _showPushToast(t('club.change_badge'), t('club.badge_changed'));
      _loadClubList();
    } catch (err) {
      console.error('changeClubBadge failed:', err);
      _showPushToast(t('club.change_badge'),
        err && err.code === 'storage/unauthorized' ? t('save.error_perms') : t('save.error'));
    }
  }

  async function _saveLeadEmail(clubId) {
    const inp = document.querySelector('.club-lead-input[data-club="' + clubId + '"]');
    const msg = document.querySelector('.club-lead-msg[data-club="' + clubId + '"]');
    const btn = document.querySelector('.btn-save-lead[data-club="' + clubId + '"]');
    if (!inp) return;
    const email = normalizeEmail(inp.value);
    if (!isValidEmail(email) || email === normalizeEmail(inp.dataset.orig)) return;
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    try {
      await updateClub(clubId, { leadEmail: email });
      inp.dataset.orig = email;
      if (msg) {
        msg.style.color = 'var(--primary)';
        msg.textContent = t('club.lead_changed');
      }
      _showPushToast(t('club.change_lead'), t('club.lead_changed'));
    } catch (err) {
      console.error('change lead failed:', err);
      if (msg) {
        msg.style.color = 'var(--danger)';
        msg.textContent = (err && err.message) || t('save.error');
      }
    }
    if (btn) { btn.textContent = '💾'; }
  }

  // #endregion Training & Staff Views

  // #region Matchday, Calendar & Convocatòria
  // ---- Custom Mon-Sun date picker ----
  let dpEl = null, dpInput = null, dpYear = 0, dpMonth = 0;
  function openDatePicker(inp) {
    closeDatePicker();
    dpInput = inp;
    const now = new Date();
    const isoVal = inp.dataset.dateIso || inp.value || '';
    const cur = isoVal && !isNaN(new Date(isoVal + 'T12:00:00').getTime()) ? new Date(isoVal + 'T12:00:00') : now;
    dpYear = cur.getFullYear(); dpMonth = cur.getMonth();
    dpEl = document.createElement('div');
    dpEl.className = 'dp-popup';
    document.body.appendChild(dpEl);
    renderDP();
    const rect = inp.getBoundingClientRect();
    dpEl.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    dpEl.style.left = (rect.left + window.scrollX) + 'px';
    setTimeout(() => document.addEventListener('click', dpOutside), 0);
    // The dashboard content pane scrolls, not the document, so a popup placed
    // at document coordinates does not travel with its input. Dismiss it the
    // same way an outside click does rather than leave it stranded.
    document.addEventListener('scroll', closeDatePicker, true);
  }
  function closeDatePicker() {
    if (dpEl) { dpEl.remove(); dpEl = null; }
    document.removeEventListener('click', dpOutside);
    document.removeEventListener('scroll', closeDatePicker, true);
  }
  function dpOutside(e) { if (dpEl && !dpEl.contains(e.target) && e.target !== dpInput) closeDatePicker(); }
  function renderDP() {
    if (!dpEl) return;
    const today = new Date(); today.setHours(0,0,0,0);
    const todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    const selVal = dpInput ? (dpInput.dataset.dateIso || dpInput.value) : '';
    const days = [t('dpday.0'),t('dpday.1'),t('dpday.2'),t('dpday.3'),t('dpday.4'),t('dpday.5'),t('dpday.6')];
    const months = [0,1,2,3,4,5,6,7,8,9,10,11].map(i => tMonth(i));
    const first = new Date(dpYear, dpMonth, 1);
    let startDay = first.getDay() - 1; if (startDay < 0) startDay = 6; // Mon=0
    const daysInMonth = new Date(dpYear, dpMonth + 1, 0).getDate();
    let cells = '';
    for (let i = 0; i < startDay; i++) cells += '<span class="dp-cell dp-empty"></span>';
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = dpYear + '-' + String(dpMonth+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
      const allowPast = dpInput && dpInput.hasAttribute('data-allow-past');
      const past = (!allowPast && ds < todayStr) ? ' dp-disabled' : '';
      const sel = ds === selVal ? ' dp-selected' : '';
      const tod = ds === todayStr ? ' dp-today' : '';
      cells += `<span class="dp-cell dp-day${past}${sel}${tod}" data-date="${ds}">${d}</span>`;
    }
    dpEl.innerHTML = `<div class="dp-header"><button class="dp-nav" data-dp="prev">&lsaquo;</button><span class="dp-title">${months[dpMonth]} ${dpYear}</span><button class="dp-nav" data-dp="next">&rsaquo;</button></div><div class="dp-grid">${days.map(d => '<span class="dp-cell dp-head">' + d + '</span>').join('')}${cells}</div>`;
    dpEl.querySelectorAll('.dp-day:not(.dp-disabled)').forEach(c => c.addEventListener('click', () => {
      const iso = c.dataset.date;
      if (dpInput.hasAttribute('data-display-dmy')) {
        const parts = iso.split('-');
        dpInput.value = parts[2] + '/' + parts[1] + '/' + parts[0];
        dpInput.dataset.dateIso = iso;
      } else {
        dpInput.value = iso;
      }
      dpInput.dispatchEvent(new Event('input', {bubbles:true}));
      closeDatePicker();
    }));
    dpEl.querySelector('[data-dp="prev"]').addEventListener('click', (e) => { e.stopPropagation(); dpMonth--; if (dpMonth < 0) { dpMonth = 11; dpYear--; } renderDP(); });
    dpEl.querySelector('[data-dp="next"]').addEventListener('click', (e) => { e.stopPropagation(); dpMonth++; if (dpMonth > 11) { dpMonth = 0; dpYear++; } renderDP(); });
  }

  function getWeekBounds(offset) {
    const now = new Date();
    const day = now.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon + offset * 7);
    const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
    function pad(d) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    return { start: pad(mon), end: pad(sun) };
  }

  function renderWeekActivities(weekOffset) {
    const { start, end } = getWeekBounds(weekOffset);
    const matches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
    const session = getSession();
    /* Only the sessions this player is actually called to. This used to read
       the WHOLE club's calendar with no filter at all -- a juvenil player's
       page listed amateur sessions and let him answer availability for them
       -- and it is the same helper that makes a guest see the session he was
       borrowed for. Narrowing and the new feature are one change. */
    const training = playerTrainings(session, getTrainings());
    const sentData = JSON.parse(localStorage.getItem('fa_convocatoria_sent') || '{}');
    const now = new Date();
    const activities = [];
    matches.filter(m => m.date >= start && m.date <= end).filter(m => {
      if (!m.date || !m.time) return true;
      return new Date(m.date + 'T' + m.time + ':00') > now;
    }).forEach(m => {
      const sentEntry = sentData[m.id];
      const sentPlayers = sentEntry ? (Array.isArray(sentEntry) ? sentEntry : (sentEntry.players || [])) : [];
      const convSent = sentPlayers.length > 0;
      const convIncluded = convSent && sentPlayers.some(id => String(id) === String(session.id));
      const sentJersey = sentEntry && !Array.isArray(sentEntry) ? sentEntry.jersey : null;
      const sentSocks = sentEntry && !Array.isArray(sentEntry) ? sentEntry.socks : null;
      const dayName = m.date ? tDay(new Date(m.date + 'T12:00:00').getDay()) : '';
      activities.push({ type: 'match', id: m.id, date: m.date, time: m.time, label: matchLabel(m), detail: `${dayName} · ${m.time} · ${sanitize(m.location || '')}`, convSent, convIncluded, sentJersey, sentSocks });
    });
    training.filter(t => t.date >= start && t.date <= end).filter(t => {
      if (!t.date || !t.time) return true;
      return new Date(t.date + 'T' + t.time.split(' - ')[0] + ':00').getTime() + 60 * 60 * 1000 > now.getTime();
    }).forEach(t => {
      const dayName = t.date ? tDay(new Date(t.date + 'T12:00:00').getDay()) : '';
      // tId navigates; tDate still keys the availability record, which is
      // date-keyed until the record migration. Two different questions.
      activities.push({ type: 'training', tId: t.id, tDate: t.date, date: t.date, time: t.time, label: sanitize(t.focus || 'Entrenament'), detail: `${dayName} · ${t.time} · ${sanitize(t.location)}` });
    });
    // Birthdays this week (skip self)
    const users = getUsers();
    const allPlayers = users.filter(u => (u.roles || []).includes('player') && u.dob && u.id !== session.id);
    allPlayers.forEach(p => {
      const parts = p.dob.split('-');
      if (parts.length !== 3) return;
      const bMonth = Number(parts[1]), bDay = Number(parts[2]);
      const thisYear = new Date(start + 'T12:00:00').getFullYear();
      let bd = new Date(thisYear, bMonth - 1, bDay);
      const bdStr = bd.getFullYear() + '-' + String(bd.getMonth()+1).padStart(2,'0') + '-' + String(bd.getDate()).padStart(2,'0');
      if (bdStr >= start && bdStr <= end) {
        const age = thisYear - Number(parts[0]);
        const dayName = tDay(bd.getDay());
        activities.push({ type: 'birthday', date: bdStr, time: '00:00', label: '🎂 ' + sanitize(p.name), detail: dayName + ' · ' + age + ' ' + t('home.age_suffix'), pic: p.profilePic || '', initial: sanitize(p.name).charAt(0).toUpperCase() });
      }
    });
    activities.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time || '').localeCompare(b.time || ''));
    if (!activities.length) return '<p style="color:var(--text-secondary)">' + t('activity.no_activities') + '</p>';
    const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
    return activities.map(a => {
      const badge = a.type === 'match'
        ? '<span class="badge badge-yellow">' + t('activity.badge_match') + '</span>'
        : '<span class="badge badge-green">' + t('activity.badge_training') + '</span>';
      let convTag = '';
      let uniformIcons = '';
      if (a.convSent) {
        if (a.sentJersey || a.sentSocks) {
          uniformIcons = `<span class="activity-uniform">${jerseySvg(a.sentJersey || 'white')}${sockSvg(a.sentSocks || 'striped')}</span>`;
        }
        convTag = a.convIncluded
          ? '<span class="conv-available-tag" data-conv-link data-conv-match="' + a.id + '" style="cursor:pointer"><span class="conv-blink-dot"></span> ' + t('activity.conv_available') + '</span>'
          : '<span class="conv-not-called-tag"><span class="conv-grey-dot"></span> ' + t('activity.conv_not_called') + '</span>';
      }
      // Match availability buttons (only when conv NOT sent)
      let matchAvailHtml = '';
      if (a.type === 'match' && !a.convSent) {
        const maData = JSON.parse(localStorage.getItem('fa_match_availability') || '{}');
        const maKey = session.id + '_' + a.id;
        const maChosen = maData[maKey] || null;
        if (maChosen) {
          const maLabels = { disponible: t('avail.disponible'), no_disponible: t('avail.no_disponible') };
          const maCls = { disponible: 'mavail-disp', no_disponible: 'mavail-nodisp' };
          matchAvailHtml = `<span class="mavail-chosen ${maCls[maChosen]}" data-mavail-match="${a.id}">${maLabels[maChosen]}</span>`;
        } else {
          matchAvailHtml = `<div class="mavail-btns" data-mavail-match="${a.id}">
            <button class="mavail-btn mavail-disp" data-mavail="disponible">${t('avail.disponible')}</button>
            <button class="mavail-btn mavail-nodisp" data-mavail="no_disponible">${t('avail.no_disponible')}</button>
          </div>`;
        }
      }
      // Training availability buttons
      let availHtml = '';
      if (a.type === 'training') {
        const tObj = training.find(tr => String(tr.id) === String(a.tId));
        const tLocked = tObj ? isTrainingLocked(tObj) : false;
        const stored = readRecord(availData, session.id, tObj, 'avail');
        if (tLocked) {
          const chosen = stored || 'na';
          const labels = { yes: t('avail.yes'), late: t('avail.late'), no: t('avail.no'), injured: t('avail.injured'), na: t('avail.na') };
          const cls = { yes: 'avail-yes', late: 'avail-late', no: 'avail-no', injured: 'avail-injured', na: 'avail-na' };
          availHtml = `<span class="avail-chosen ${cls[chosen]}">${labels[chosen]}</span>`;
        } else if (stored) {
          const labels = { yes: t('avail.yes'), late: t('avail.late'), no: t('avail.no'), injured: t('avail.injured'), na: t('avail.na') };
          const cls = { yes: 'avail-yes', late: 'avail-late', no: 'avail-no', injured: 'avail-injured', na: 'avail-na' };
          availHtml = `<span class="avail-chosen ${cls[stored]}" data-avail-sid="${sanitize(String(a.tId || ''))}">${labels[stored]}</span>`;
        } else {
          // Default to Yes badge (clickable to expand buttons)
          availHtml = `<span class="avail-chosen avail-yes avail-default" data-avail-sid="${sanitize(String(a.tId || ''))}">${t('avail.yes')}</span>`;
        }
      }
      if (a.type === 'birthday') {
        const picHtml = a.pic
          ? `<img src="${a.pic}" alt="" class="birthday-avatar">`
          : `<span class="birthday-avatar birthday-avatar-placeholder">${a.initial}</span>`;
        return `<div class="activity-item"><span class="badge badge-birthday">${t('activity.badge_birthday')}</span><div class="activity-info"><div class="activity-label">${a.label}</div><div class="activity-detail">${a.detail}</div></div>${picHtml}</div>`;
      }
      const dataAttr = a.type === 'match'
        ? `data-go-match="${a.id}"`
        : `data-go-training="${sanitize(String(a.tId || ''))}"`;
      return `<div class="activity-item activity-item-link" ${dataAttr}>${badge}<div class="activity-info"><div class="activity-label">${a.label}</div><div class="activity-detail">${a.detail}</div></div>${convTag}${uniformIcons}${availHtml}${matchAvailHtml}</div>`;
    }).join('');
  }

  // sanitize → utils.js

  function matchLabel(m) {
    const tl = m.team ? ' <span class="conv-team-circle">' + sanitize(m.team) + '</span>' : '';
    const h = isOurTeam(m.home) ? sanitize(m.home) + tl : sanitize(m.home);
    const a = isOurTeam(m.away) ? sanitize(m.away) + tl : sanitize(m.away);
    return h + ' vs ' + a;
  }

  function buildAssistanceCircle(pct) {
    const size = 40;
    const stroke = 5;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (pct / 100) * circumference;
    const color = pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--accent)' : 'var(--danger)';
    return `<div class="assistance-circle" title="${pct}%">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="var(--border)" stroke-width="${stroke}"/>
        <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="${color}" stroke-width="${stroke}"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
          style="--circ:${circumference}" stroke-linecap="round" transform="rotate(-90 ${size/2} ${size/2})"/>
      </svg>
      <span class="assistance-pct">${pct}%</span>
    </div>`;
  }

  /**
   * @param {string} trainingDate
   * @param {Object} [tObj] The session, when the caller already has it \u2014
   *   this is rendered once per row, and re-reading and re-parsing the whole
   *   training list to find a session the caller is holding was the other
   *   half of the Sessions list being slow.
   */
  function buildAvailDonut(trainingDate, tObj) {
    const players = getUsers().filter(u => (u.roles || []).includes('player'));
    const total = players.length;
    if (!total) return '<span style="color:var(--text-secondary)">\u2014</span>';
    // The date is only a fallback lookup: two squads can share one, so a
    // caller holding the session should always pass it.
    const session = tObj ||
      getTrainings().find(x => x.date === trainingDate);
    const locked = session ? isTrainingLocked(session) : false;
    const ctx = availContext();
    let yes = 0, late = 0, no = 0, injured = 0, na = 0;
    players.forEach(p => {
      const v = getEffectiveAnswer(p.id, session, locked, ctx);
      if (v === 'yes') yes++;
      else if (v === 'late') late++;
      else if (v === 'no') no++;
      else if (v === 'injured') injured++;
      else na++;
    });
    const attending = yes + late;
    const size = 44;
    const stroke = 6;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const segments = [
      { count: yes, color: '#66bb6a', label: 'Yes' },
      { count: late, color: '#ffa726', label: 'Late' },
      { count: no, color: '#78909c', label: 'No' },
      { count: injured, color: '#ef5350', label: 'Injured' },
      { count: na, color: '#d0d0d0', label: 'N/A' }
    ];
    let arcs = '';
    let offset = 0;
    segments.forEach(s => {
      if (s.count > 0) {
        const len = (s.count / total) * circumference;
        const sPct = Math.round((s.count / total) * 100);
        arcs += `<circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="${s.color}" stroke-width="${stroke}"
          stroke-dasharray="${len} ${circumference - len}" stroke-dashoffset="${-offset}"
          style="--circ:${circumference};cursor:pointer;pointer-events:stroke" transform="rotate(-90 ${size/2} ${size/2})" data-tooltip="${s.label}: ${sPct}%"><title>${s.label}: ${sPct}%</title></circle>`;
        offset += len;
      }
    });
    const tooltip = `${attending}/${total} attending (Yes:${yes} Late:${late} No:${no} Injured:${injured})`;
    return `<div class="assistance-circle" title="${tooltip}">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="var(--border)" stroke-width="${stroke}"/>
        ${arcs}
      </svg>
      <span class="assistance-pct">${attending}/${total}</span>
    </div>`;
  }

  // ---------- Matchday bindings ----------
  function bindMatchday() {
    const body = document.getElementById('matchday-body');

    // Add game button (always present)
    const addBtn = document.getElementById('btn-matchday-add');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const games = body ? readGames() : [];
        var cat = getCurrentCategory() || '';
        var letters = getTeamLetters(cat);
        // schedules are keyed "{category}-{letter}" (same as fcfLinks) — this
        // was building "{category}_{letter}", so the home-game defaults never
        // resolved and every new row fell back to the hardcoded location.
        var schedKey = (letters.length === 1) ? cat + '-' + letters[0] : cat;
        var sched = (_clubConfig && _clubConfig.schedules && _clubConfig.schedules[schedKey]) ? _clubConfig.schedules[schedKey] : null;
        var homeGame = sched ? sched.homeGame : null;
        var defLoc = (homeGame && homeGame.location) ? homeGame.location : 'Escola Industrial';
        var defMap = (defLoc === 'Escola Industrial') ? 'https://share.google/pfbMOc661aRSNlynk' : '';
        var defKickoff = (homeGame && homeGame.time) ? homeGame.time : '';
        games.push({ homeAway: 'home', team: '', date: '', opponent: '', location: defLoc, mapLink: defMap, kickoff: defKickoff, category: cat });
        // readGames() only sees the rendered (category-scoped) rows, so carry
        // the hidden categories' drafts through — fa_matchday is written whole.
        var keptDrafts = cat
          ? JSON.parse(localStorage.getItem('fa_matchday') || '[]')
              .filter(function (g) { return g.category && g.category !== cat; })
          : [];
        localStorage.setItem('fa_matchday', JSON.stringify(keptDrafts.concat(games)));
        renderPage(getSession());
      });
    }

    if (!body) {
      // No new games form — still bind saved match handlers below
      bindSavedMatchHandlers();
      return;
    }

    function readGames() {
      const games = [];
      body.querySelectorAll('tr').forEach(tr => {
        const haRadio = tr.querySelector('.md-ha:checked');
        const homeAway = haRadio ? haRadio.value : 'home';
        const activeTeam = tr.querySelector('.md-team-circle.active');
        const team = activeTeam ? activeTeam.dataset.team : '';
        const date = tr.querySelector('.md-date').value;
        const opponent = tr.querySelector('.md-opponent').value.trim();
        const location = tr.querySelector('.md-location').value.trim();
        const mapLink = tr.querySelector('.md-maplink').value.trim();
        const kickoff = tr.querySelector('.md-kickoff').value;
        const category = tr.dataset.category || '';
        games.push({ homeAway, team, date, opponent, location, mapLink, kickoff, category });
      });
      return games;
    }

    function saveGames() {
      // The table only renders the current category, but fa_matchday is one
      // club-wide blob written whole. Carry the drafts we are NOT showing
      // through untouched, or saving here would delete other categories'.
      var cat = getCurrentCategory();
      var kept = cat
        ? JSON.parse(localStorage.getItem('fa_matchday') || '[]')
            .filter(function (g) { return g.category && g.category !== cat; })
        : [];
      localStorage.setItem('fa_matchday', JSON.stringify(kept.concat(readGames())));
    }

    // Auto-fill location, map link, and kick-off time when home is selected
    body.addEventListener('change', e => {
      if (e.target.classList.contains('md-ha')) {
        const tr = e.target.closest('tr');
        const locInput = tr.querySelector('.md-location');
        const mapInput = tr.querySelector('.md-maplink');
        const kickoffInput = tr.querySelector('.md-kickoff');
        if (e.target.value === 'home') {
          // Try to get defaults from club schedule config
          var cat = tr.dataset.category || getCurrentCategory() || '';
          var schedKey = cat;
          var letters = getTeamLetters(cat);
          var activeCircle = tr.querySelector('.md-team-circle.active');
          if (activeCircle && activeCircle.dataset.team) schedKey = cat + '-' + activeCircle.dataset.team;
          else if (letters.length === 1) schedKey = cat + '-' + letters[0];
          var sched = (_clubConfig && _clubConfig.schedules && _clubConfig.schedules[schedKey]) ? _clubConfig.schedules[schedKey] : null;
          var homeGame = sched ? sched.homeGame : null;
          locInput.value = (homeGame && homeGame.location) ? homeGame.location : 'Escola Industrial';
          mapInput.value = (homeGame && homeGame.link) ? homeGame.link : (locInput.value === 'Escola Industrial' ? 'https://share.google/pfbMOc661aRSNlynk' : '');
          if (kickoffInput && homeGame && homeGame.time) kickoffInput.value = homeGame.time;
        } else {
          locInput.value = '';
          mapInput.value = '';
          if (kickoffInput) kickoffInput.value = '';
        }
        saveGames();
      }
    });

    // Auto-save on input & change (for selects)
    body.addEventListener('input', saveGames);
    body.addEventListener('change', saveGames);

    // Auto-format HH:MM on kickoff inputs (24h format)
    body.addEventListener('input', function(e) {
      if (!e.target.classList.contains('md-kickoff')) return;
      var v = e.target.value.replace(/[^0-9]/g, '');
      if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2, 4);
      if (v.length > 5) v = v.slice(0, 5);
      e.target.value = v;
    });

    // Custom Mon-Sun date picker
    body.querySelectorAll('.md-datepicker').forEach(inp => {
      inp.addEventListener('click', () => openDatePicker(inp));
    });

    // Team circle toggle
    body.querySelectorAll('.md-team-circle').forEach(circle => {
      circle.addEventListener('click', () => {
        const td = circle.closest('td');
        td.querySelectorAll('.md-team-circle').forEach(c => c.classList.remove('active'));
        circle.classList.add('active');
        saveGames();
      });
    });

    // Remove row. Splices the rendered (category-scoped) list, then goes back
    // through saveGames so the hidden categories' drafts survive.
    body.querySelectorAll('.md-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('tr');
        if (row) row.remove();
        saveGames();
        renderPage(getSession());
      });
    });

    // Save button — add new games to fa_matches
    const saveMdBtn = document.getElementById('btn-matchday-save');
    if (saveMdBtn) {
      saveMdBtn.addEventListener('click', () => {
        const games = readGames();
        const TEAM = (_clubConfig && _clubConfig.name) ? _clubConfig.name : 'Esquerra';
        const today = new Date().toISOString().slice(0, 10);
        const newMatches = games.filter(g => g.opponent && g.date).map((g, i) => ({
          id: Date.now() + i,
          home: g.homeAway === 'home' ? TEAM : g.opponent,
          away: g.homeAway === 'home' ? g.opponent : TEAM,
          date: g.date,
          time: g.kickoff || '00:00',
          score: null,
          status: g.date >= today ? 'upcoming' : 'played',
          location: g.location,
          mapLink: g.mapLink,
          team: g.team || '',
          category: g.category || getCurrentCategory() || ''
        }));
        // Append to existing matches instead of replacing
        var existing = JSON.parse(localStorage.getItem('fa_matches') || '[]');
        existing = existing.concat(newMatches);
        localStorage.setItem('fa_matches', JSON.stringify(existing));
        // Clear the new games form — but only the rows we just saved. Other
        // categories' drafts are not ours to throw away.
        var cat = getCurrentCategory();
        var keptDrafts = cat
          ? JSON.parse(localStorage.getItem('fa_matchday') || '[]')
              .filter(function (g) { return g.category && g.category !== cat; })
          : [];
        localStorage.setItem('fa_matchday', JSON.stringify(keptDrafts));
        renderPage(getSession());
      });
    }

    bindSavedMatchHandlers();
  }

  function bindSavedMatchHandlers() {
    // Edit button on saved match
    $$('.md-edit-match').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _mdEditingId = Number(btn.dataset.matchId) || btn.dataset.matchId;
        renderPage(getSession());
      });
    });

    // Cancel edit
    $$('.md-cancel-edit').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _mdEditingId = null;
        renderPage(getSession());
      });
    });

    // Save edit on existing match
    $$('.md-save-edit').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var matchId = Number(btn.dataset.matchId) || btn.dataset.matchId;
        var tr = btn.closest('tr');
        if (!tr) return;
        var haRadio = tr.querySelector('.md-ha:checked');
        var homeAway = haRadio ? haRadio.value : 'home';
        var activeTeam = tr.querySelector('.md-team-circle.active');
        var team = activeTeam ? activeTeam.dataset.team : '';
        var date = tr.querySelector('.md-date').value;
        var opponent = tr.querySelector('.md-opponent').value.trim();
        var location = tr.querySelector('.md-location').value.trim();
        var mapLink = tr.querySelector('.md-maplink').value.trim();
        var kickoff = tr.querySelector('.md-kickoff').value;
        var TEAM = (_clubConfig && _clubConfig.name) ? _clubConfig.name : 'Esquerra';
        var matches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
        var idx = matches.findIndex(function(m) { return m.id === matchId; });
        if (idx !== -1) {
          matches[idx].home = homeAway === 'home' ? TEAM : opponent;
          matches[idx].away = homeAway === 'home' ? opponent : TEAM;
          matches[idx].date = date;
          matches[idx].time = kickoff || '00:00';
          matches[idx].location = location;
          matches[idx].mapLink = mapLink;
          matches[idx].team = team;
          localStorage.setItem('fa_matches', JSON.stringify(matches));
        }
        _mdEditingId = null;
        renderPage(getSession());
      });
    });

    // Delete saved match
    $$('.md-delete-match').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var matchId = Number(btn.dataset.matchId) || btn.dataset.matchId;
        showModal('Delete Match', 'Are you sure you want to delete this match?', function() {
          var matches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
          matches = matches.filter(function(m) { return m.id !== matchId; });
          localStorage.setItem('fa_matches', JSON.stringify(matches));
          renderPage(getSession());
        });
      });
    });

    // Date picker and team circle toggle for edit rows
    $$('.md-saved-table .md-datepicker').forEach(function(inp) {
      inp.addEventListener('click', function() { openDatePicker(inp); });
    });
    $$('.md-saved-table .md-team-circle').forEach(function(circle) {
      circle.addEventListener('click', function() {
        var td = circle.closest('td');
        td.querySelectorAll('.md-team-circle').forEach(function(c) { c.classList.remove('active'); });
        circle.classList.add('active');
      });
    });
  }

  // ---------- Custom Modal ----------
  // `opts` is optional: { confirmLabel, danger } — the labels used to be
  // hard-coded English ("No" / "Yes, remove"), which reads wrong for anything
  // that isn't a removal.
  function showModal(title, message, onConfirm, opts) {
    const o = opts || {};
    const confirmLabel = o.confirmLabel || t('common.confirm');
    const confirmClass = o.danger === false ? 'btn-primary' : 'btn-danger';
    // Remove existing modal if any
    const existing = document.getElementById('custom-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'custom-modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card">
        <div class="modal-title">${sanitize(title)}</div>
        <p class="modal-message">${sanitize(message)}</p>
        <div class="modal-actions">
          ${o.hideCancel ? '' : `<button class="btn btn-small btn-outline" id="modal-btn-no">${t('common.cancel')}</button>`}
          <button class="btn btn-small ${confirmClass}" id="modal-btn-yes">${sanitize(confirmLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    // Trigger fade in
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const close = () => { overlay.classList.remove('visible'); setTimeout(() => overlay.remove(), 200); };
    const noBtn = overlay.querySelector('#modal-btn-no');   // absent when hideCancel
    if (noBtn) noBtn.addEventListener('click', close);
    overlay.querySelector('#modal-btn-yes').addEventListener('click', () => { close(); onConfirm(); });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }

  // ---------- New Season Modal (two-step confirmation) ----------
  function showNewSeasonModal() {
    const existing = document.getElementById('custom-modal-overlay');
    if (existing) existing.remove();

    // Auto-suggest season label
    var now = new Date();
    var sy = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    var suggestedLabel = sy + '-' + (sy + 1);

    var overlay = document.createElement('div');
    overlay.id = 'custom-modal-overlay';
    overlay.className = 'modal-overlay';

    // Step 1: season label
    overlay.innerHTML = `
      <div class="modal-card" style="max-width:380px;">
        <div class="modal-title">${sanitize(t('confirm.new_season_title'))}</div>
        <p class="modal-message" style="white-space:pre-line;font-size:.88rem;">${sanitize(t('confirm.new_season_msg'))}</p>
        <div class="form-group" style="margin:1rem 0 .6rem;">
          <label for="season-label-input" style="font-size:.85rem;font-weight:600;">${sanitize(t('confirm.new_season_label'))}</label>
          <input type="text" id="season-label-input" value="${suggestedLabel}" style="font-size:1rem;text-align:center;letter-spacing:.1em;font-weight:600;" maxlength="20">
        </div>
        <div class="modal-actions">
          <button class="btn btn-small btn-outline" id="modal-btn-no">${t('btn.cancel')}</button>
          <button class="btn btn-small btn-primary" id="modal-btn-next">${t('btn.continue') || 'Continuar'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    var close = function() { overlay.classList.remove('visible'); setTimeout(() => overlay.remove(), 200); };
    overlay.querySelector('#modal-btn-no').addEventListener('click', close);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });

    overlay.querySelector('#modal-btn-next').addEventListener('click', function() {
      var label = (document.getElementById('season-label-input').value || '').trim();
      if (!label) return;
      showNewSeasonStep2(overlay, label);
    });
  }

  function showNewSeasonStep2(overlay, label) {
    var confirmPhrase = t('confirm.new_season_phrase');
    var card = overlay.querySelector('.modal-card');
    card.innerHTML = `
      <div class="modal-title">${sanitize(t('confirm.new_season_title'))}</div>
      <p class="modal-message" style="font-size:.88rem;margin-bottom:.6rem;">${sanitize(t('confirm.new_season_step2'))}</p>
      <p style="text-align:center;font-weight:700;font-size:1.05rem;letter-spacing:.08em;color:var(--danger);margin-bottom:.8rem;">${sanitize(confirmPhrase)}</p>
      <div class="form-group" style="margin-bottom:1rem;">
        <input type="text" id="season-confirm-input" placeholder="" style="font-size:1rem;text-align:center;letter-spacing:.08em;" autocomplete="off">
      </div>
      <div class="modal-actions">
        <button class="btn btn-small btn-outline" id="modal-btn-no">${t('btn.cancel')}</button>
        <button class="btn btn-small btn-danger" id="modal-btn-archive" disabled>${t('settings.new_season_btn')}</button>
      </div>
    `;

    var close = function() { overlay.classList.remove('visible'); setTimeout(() => overlay.remove(), 200); };
    overlay.querySelector('#modal-btn-no').addEventListener('click', close);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });

    var inp = document.getElementById('season-confirm-input');
    var archiveBtn = overlay.querySelector('#modal-btn-archive');
    inp.addEventListener('input', function() {
      archiveBtn.disabled = inp.value.trim().toUpperCase() !== confirmPhrase.toUpperCase();
    });

    archiveBtn.addEventListener('click', function() {
      archiveBtn.disabled = true;
      archiveBtn.textContent = t('alert.new_season_archiving');
      executeSeasonArchive(label, overlay);
    });
  }

  /* Irreversible, superadmin-only erase. Typed confirmation rather than a
     one-tap dialog: this destroys the account and every record, and unlike
     "leave the squad" on the Registrations page there is no way back. */
  /**
   * Delete a team and everything belonging to it.
   *
   * Typed confirmation rather than a one-tap dialog, for the same reason
   * showDeleteMemberModal uses one: this erases a squad's matches, medical
   * history and availability, and there is no way back. The phrase is the
   * team key itself, so the lead has to name the team they are destroying.
   */
  function showDeleteTeamModal(category, letter) {
    var teamKey = category + '-' + letter;
    var existing = document.getElementById('custom-modal-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'custom-modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card" style="max-width:420px;">
        <div class="modal-title">${sanitize(t('team_del.title').replace('{team}', teamKey))}</div>
        <p class="modal-message" style="white-space:pre-line;font-size:.88rem;text-align:left;">${sanitize(t('team_del.msg').replace('{team}', teamKey))}</p>
        <p style="font-size:.82rem;color:var(--text-secondary);text-align:left;margin:.4rem 0 .8rem;">${sanitize(t('team_del.kept'))}</p>
        <p style="font-size:.82rem;text-align:left;margin-bottom:.4rem;">${sanitize(t('team_del.confirm_hint').replace('{team}', teamKey))}</p>
        <div class="form-group" style="margin-bottom:1rem;">
          <input type="text" id="team-del-input" style="font-size:1rem;text-align:center;" autocomplete="off">
        </div>
        <div id="team-del-result" style="font-size:.85rem;text-align:center;margin-bottom:.6rem;"></div>
        <div class="modal-actions">
          <button class="btn btn-small btn-outline" id="modal-btn-no">${t('common.cancel')}</button>
          <button class="btn btn-small btn-danger" id="modal-btn-delteam" disabled>${t('team_del.button')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('visible'); });

    var close = function () {
      overlay.classList.remove('visible');
      setTimeout(function () { overlay.remove(); }, 200);
    };
    overlay.querySelector('#modal-btn-no').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    var inp = overlay.querySelector('#team-del-input');
    var delBtn = overlay.querySelector('#modal-btn-delteam');
    inp.addEventListener('input', function () {
      delBtn.disabled = inp.value.trim().toLowerCase() !== teamKey.toLowerCase();
    });

    delBtn.addEventListener('click', async function () {
      delBtn.disabled = true;
      delBtn.textContent = t('team_del.deleting');
      var resultEl = overlay.querySelector('#team-del-result');
      resultEl.style.color = 'var(--text-secondary)';
      resultEl.textContent = t('team_del.deleting');
      try {
        var fn = firebase.app().functions('us-central1').httpsCallable('deleteTeam');
        await fn({ category: category, letter: letter });
        // Re-read rather than patch: the callable may also have disabled the
        // category, and the screen is rebuilt from _clubConfig.
        await loadClubConfig(getSession().teamId);
        close();
        _showPushToast(t('team_del.button'), t('team_del.done'));
        navigate();
      } catch (err) {
        console.error('deleteTeam failed:', err);
        resultEl.style.color = 'var(--danger)';
        resultEl.textContent = (err && err.message) || t('team_del.failed');
        delBtn.disabled = false;
        delBtn.textContent = t('team_del.button');
      }
    });
  }

  function showDeleteMemberModal(uid) {
    var user = getUsers().find(function (u) { return String(u.id) === String(uid); });
    if (!user) return;
    var confirmPhrase = (user.name || '').trim();
    var existing = document.getElementById('custom-modal-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'custom-modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card" style="max-width:400px;">
        <div class="modal-title">${sanitize(t('confirm.erase_title'))}</div>
        <p class="modal-message" style="white-space:pre-line;font-size:.88rem;text-align:left;">${sanitize(t('confirm.erase_msg').replace('{name}', confirmPhrase))}</p>
        <p style="font-size:.82rem;color:var(--text-secondary);text-align:left;margin:.4rem 0 .8rem;">${sanitize(t('confirm.erase_kept'))}</p>
        <p style="text-align:center;font-weight:700;font-size:1rem;color:var(--danger);margin-bottom:.6rem;">${sanitize(confirmPhrase)}</p>
        <div class="form-group" style="margin-bottom:1rem;">
          <input type="text" id="erase-confirm-input" style="font-size:1rem;text-align:center;" autocomplete="off">
        </div>
        <div id="erase-result" style="font-size:.85rem;text-align:center;margin-bottom:.6rem;"></div>
        <div class="modal-actions">
          <button class="btn btn-small btn-outline" id="modal-btn-no">${t('common.cancel')}</button>
          <button class="btn btn-small btn-danger" id="modal-btn-erase" disabled>${t('btn.delete')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('visible'); });

    var close = function () {
      overlay.classList.remove('visible');
      setTimeout(function () { overlay.remove(); }, 200);
    };
    overlay.querySelector('#modal-btn-no').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    var inp = overlay.querySelector('#erase-confirm-input');
    var eraseBtn = overlay.querySelector('#modal-btn-erase');
    inp.addEventListener('input', function () {
      eraseBtn.disabled = inp.value.trim().toLowerCase() !== confirmPhrase.toLowerCase();
    });

    eraseBtn.addEventListener('click', async function () {
      eraseBtn.disabled = true;
      eraseBtn.textContent = t('auth.saving');
      var resultEl = overlay.querySelector('#erase-result');
      try {
        var fn = firebase.app().functions('us-central1').httpsCallable('deleteMember');
        var res = await fn({ uid: uid });
        var d = (res && res.data) || {};
        // Drop them locally too, so the table is right before the next sync.
        var users = getUsers().filter(function (u) { return String(u.id) !== String(uid); });
        saveUsers(users);
        // ...and out of the cached roster lists. deleteMember strips their
        // address server-side, but this copy is what Registrations renders
        // from — leave it and the person reappears instantly as a "pending"
        // row with an orange dot, looking like the delete half-failed.
        var goneEmail = normalizeEmail(user.email);
        if (goneEmail && _clubConfig && _clubConfig.rosters) {
          Object.keys(_clubConfig.rosters).forEach(function (k) {
            var r = _clubConfig.rosters[k] || {};
            ['staffEmails', 'playerEmails'].forEach(function (f) {
              if (!Array.isArray(r[f])) return;
              r[f] = r[f].filter(function (e) { return normalizeEmail(e) !== goneEmail; });
            });
          });
        }
        close();
        _showPushToast(t('confirm.erase_title'),
          t('alert.erase_done')
            .replace('{name}', confirmPhrase)
            .replace('{records}', d.records != null ? d.records : '?'));
        renderPage(getSession());
      } catch (err) {
        console.error('deleteMember failed:', err);
        resultEl.style.color = 'var(--danger)';
        resultEl.textContent = (err && err.message) || t('save.error');
        eraseBtn.disabled = false;
        eraseBtn.textContent = t('btn.delete');
      }
    });
  }

  async function executeSeasonArchive(label, overlay) {
    var close = function() { overlay.classList.remove('visible'); setTimeout(() => overlay.remove(), 200); };
    var resultEl = document.getElementById('new-season-result');
    try {
      var session = getSession();
      if (!session || !session.teamId) throw new Error('No team');

      var token = await auth.currentUser.getIdToken();
      var resp = await fetch('https://archiveseason-674dkdzfja-uc.a.run.app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ teamId: session.teamId, label: label })
      });
      if (!resp.ok) {
        var err = await resp.json().catch(function() { return {}; });
        throw new Error(err.error || resp.status);
      }

      close();
      // Refresh local data — onSnapshot will propagate, but also force re-read
      invalidateUsersCache();
      alert(t('alert.new_season_ok'));
      renderPage(getSession());
    } catch (e) {
      close();
      console.error('Season archive failed:', e);
      if (resultEl) {
        resultEl.textContent = t('alert.new_season_fail') + ' (' + e.message + ')';
        resultEl.style.color = 'var(--danger)';
        resultEl.hidden = false;
      } else {
        alert(t('alert.new_season_fail'));
      }
    }
  }

  // ---------- Staff Training bindings ----------
  function bindStaffTraining() {
    const body = document.getElementById('staff-training-body');
    if (!body) return;
    const DEFAULT_LOC = 'Escola Industrial';
    const DEFAULT_MAP = 'https://share.google/pfbMOc661aRSNlynk';

    function readTraining() {
      const training = getTrainings();
      body.querySelectorAll('tr:not(.st-locked)').forEach(tr => {
        // By id, never by position: this runs on every keystroke, and the
        // array it writes into can be reordered underneath us.
        const row = training.find(x => x.id === tr.dataset.tid);
        if (!row) return;
        const dateInput = tr.querySelector('.st-date');
        const timeInput = tr.querySelector('.st-time');
        const focusInput = tr.querySelector('.st-focus');
        const locInput = tr.querySelector('.st-location');
        const linkInput = tr.querySelector('.st-link');
        if (!dateInput) return;
        const dateIso = dateInput.dataset.dateIso || dateInput.value;
        row.date = dateIso;
        row.day = dateIso ? tDay(new Date(dateIso + 'T12:00:00').getDay()) : row.day;
        if (timeInput.value) row.time = timeInput.value;
        row.focus = focusInput.value.trim();
        row.location = locInput.value.trim();
        row.mapLink = linkInput.value.trim();
      });
      return training;
    }

    // Open custom datepicker on click & update day label on input
    body.querySelectorAll('.st-date').forEach(input => {
      input.addEventListener('click', () => openDatePicker(input));
      input.addEventListener('input', () => {
        const iso = input.dataset.dateIso || input.value;
        const dayLabel = input.closest('td').querySelector('.st-day-label');
        if (dayLabel && iso) {
          dayLabel.textContent = tDay(new Date(iso + 'T12:00:00').getDay());
        }
      });
    });

    // Escola Industrial <-> link coupling
    body.querySelectorAll('.st-location').forEach(input => {
      input.addEventListener('change', () => {
        const idx = input.dataset.idx;
        const linkInput = body.querySelector(`.st-link[data-idx="${idx}"]`);
        const val = input.value.trim();
        if (val === DEFAULT_LOC) {
          linkInput.value = DEFAULT_MAP;
        } else if (!val) {
          linkInput.value = '';
        }
      });
    });
    body.querySelectorAll('.st-link').forEach(input => {
      input.addEventListener('change', () => {
        const idx = input.dataset.idx;
        const locInput = body.querySelector(`.st-location[data-idx="${idx}"]`);
        if (!input.value.trim() && locInput.value.trim() === DEFAULT_LOC) {
          locInput.value = '';
        }
      });
    });

    // Clear error highlight on focus fields when typing
    body.querySelectorAll('.st-focus').forEach(input => {
      input.addEventListener('input', () => {
        if (input.value.trim()) input.classList.remove('input-error');
      });
    });

    // Auto-save on input/change
    body.addEventListener('input', () => {
      localStorage.setItem('fa_training', JSON.stringify(readTraining()));
    });
    body.addEventListener('change', () => {
      localStorage.setItem('fa_training', JSON.stringify(readTraining()));
    });

    // Remove training
    body.querySelectorAll('.st-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const training = getTrainings();
        const pos = training.findIndex(x => x.id === btn.dataset.idx);
        if (pos === -1) return;
        training.splice(pos, 1);
        localStorage.setItem('fa_training', JSON.stringify(training));
        renderPage(getSession());
      });
    });

    // Add training
    function addTraining() {
      const training = readTraining();
      const curCat = getCurrentCategory() || '';
      // Gather configured training slots from club schedule
      const dayValToJs = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
      /* Slots keep the LETTERS they belong to. The old dedup collapsed
         every letter's slots into one list and discarded the letter, so if
         A trained Tue 20:00 and B Tue 21:30 whichever was iterated first
         won and B's slot vanished without a word. Identical day+time+place
         across letters still collapses -- that is a genuinely shared
         session -- but only by MERGING their letters, never by dropping
         one. */
      var slots = []; // [{ jsDay, time, endTime, location, link, teams: [] }]
      if (_clubConfig && _clubConfig.schedules) {
        var letters = getTeamLetters(curCat);
        letters.forEach(function (letter) {
          var sched = _clubConfig.schedules[curCat + '-' + letter];
          if (sched && sched.training) {
            sched.training.forEach(function (tr) {
              if (!tr.day || dayValToJs[tr.day] === undefined) return;
              var same = slots.find(function (s) {
                return s.jsDay === dayValToJs[tr.day] && s.time === (tr.time || '') &&
                  s.endTime === (tr.endTime || '') && s.location === (tr.location || '');
              });
              if (same) {
                if (same.teams.indexOf(letter) === -1) same.teams.push(letter);
                return;
              }
              slots.push({
                jsDay: dayValToJs[tr.day], time: tr.time || '', endTime: tr.endTime || '',
                location: tr.location || '', link: tr.link || '', teams: [letter]
              });
            });
          }
        });
      }
      // Fallback to Tue/Thu if no schedule configured. No teams: an empty
      // list already means "every letter of the category".
      if (!slots.length) slots = [{ jsDay: 2, time: '21:00', endTime: '', location: '', link: '', teams: [] }, { jsDay: 4, time: '22:00', endTime: '', location: '', link: '', teams: [] }];
      // Sort slots by JS day
      slots.sort(function (a, b) { return a.jsDay - b.jsDay; });
      var slotDays = slots.map(function (s) { return s.jsDay; }); // e.g. [2, 4] for Tue/Thu
      // Find the latest training date to cycle from — within this category,
      // since the slots above are this category's. Undated/uncategorised
      // legacy rows count, matching how the list itself filters.
      var allDates = training
        .filter(function (t) { return t.date && (!curCat || !t.category || t.category === curCat); })
        .map(function (t) { return t.date; });
      var lastDate = allDates.length ? allDates.sort().pop() : null;
      // Seed at yesterday-noon so the search below can land on today at the
      // earliest. Noon avoids DST/UTC shifting the ISO date.
      var seed = new Date();
      seed.setHours(12, 0, 0, 0);
      seed.setDate(seed.getDate() - 1);
      var d = seed;
      if (lastDate) {
        var fromLast = new Date(lastDate + 'T12:00:00');
        // Cycle on from the last session, but never backwards: an old last
        // training (say the season stopped in May) must not produce a new
        // session in the past — fall back to the from-today search instead.
        if (fromLast > seed) d = fromLast;
      }
      // Determine next slot day AFTER the seed's weekday
      var latestDow = d.getDay(); // 0=Sun … 6=Sat
      var nextSlotDay = null;
      for (var i = 0; i < slotDays.length; i++) {
        if (slotDays[i] > latestDow) { nextSlotDay = slotDays[i]; break; }
      }
      if (nextSlotDay === null) nextSlotDay = slotDays[0]; // wrap to next week
      var diff = nextSlotDay - latestDow;
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      /* EVERY slot on that weekday, not just the first. Two teams whose
         schedules put them on the same evening at different times are two
         sessions, and `find` returned one of them -- which is how B's
         entry disappeared. Slots that agree on day, time, end and place
         were already merged above into one session carrying both letters. */
      var matched = slots.filter(function (s) { return s.jsDay === nextSlotDay; });
      if (!matched.length) matched = [slots[0]];
      const dateStr = d.toISOString().slice(0, 10);
      const day = tDay(d.getDay());
      matched.forEach(function (slot, i) {
        const loc = slot.location || DEFAULT_LOC;
        const map = slot.link || (loc === DEFAULT_LOC ? DEFAULT_MAP : '');
        training.push({
          // The suffix keeps ids unique when one click creates several.
          id: 'tr_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 8),
          day, date: dateStr, time: slot.time, endTime: slot.endTime || '',
          focus: '', location: loc, mapLink: map,
          status: 'upcoming', category: curCat,
          // Empty already means "every letter of the category".
          teams: (slot.teams || []).slice(), guests: [], excluded: []
        });
      });
      training.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      localStorage.setItem('fa_training', JSON.stringify(training));
      renderPage(getSession());
    }
    const addBtnTop = document.getElementById('btn-training-add-top');
    if (addBtnTop) addBtnTop.addEventListener('click', addTraining);

    // Click any training row → open staff training detail
    body.querySelectorAll('tr[data-tid]').forEach(tr => {
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', (e) => {
        // Don't navigate if clicking inputs, buttons or links
        if (e.target.closest('input, select, button, a, .md-remove-btn, .st-remove')) return;
        const training = getTrainings();
        const t = training.find(x => x.id === tr.dataset.tid);
        if (!t || !t.date) return;
        detailTrainingId = t.id;
        currentPage = 'staff-training-detail';
        renderPage(getSession());
      });
    });
  }

  // Staff training detail: staff override selects + team generation
  function bindStaffTrainingDetail() {
    document.querySelectorAll('.std-staff-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const playerId = sel.dataset.player;
        const sess = getTrainings().find(x => String(x.id) === String(sel.dataset.sid));
        if (!sess) return;
        const key = recordKey(playerId, sess, 'avail');
        const overrides = JSON.parse(localStorage.getItem('fa_training_staff_override') || '{}');
        overrides[key] = sel.value;
        localStorage.setItem('fa_training_staff_override', JSON.stringify(overrides));
        renderPage(getSession());
      });
    });

    // ── Auto Generate Teams ──
    const toggleBtn = document.getElementById('btn-tg-toggle');
    const configPanel = document.getElementById('tg-config');
    if (toggleBtn && configPanel) {
      toggleBtn.addEventListener('click', () => {
        configPanel.hidden = !configPanel.hidden;
        toggleBtn.textContent = configPanel.hidden ? '⚙️ Configure' : '⚙️ Hide';
      });
    }

    // Team filter buttons (All / A / B)
    document.querySelectorAll('[data-tg-team]').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.parentElement.querySelectorAll('.tg-btn').forEach(b => b.classList.remove('tg-btn-active'));
        btn.classList.add('tg-btn-active');
      });
    });
    // Distribution mode buttons (Mix / Equal)
    document.querySelectorAll('[data-tg-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.parentElement.querySelectorAll('.tg-btn').forEach(b => b.classList.remove('tg-btn-active'));
        btn.classList.add('tg-btn-active');
      });
    });

    // Include GK toggle label update
    const gkChk = document.getElementById('tg-include-gk');
    if (gkChk) {
      gkChk.addEventListener('change', () => {
        const lbl = gkChk.parentElement.querySelector('.tg-toggle-text');
        if (lbl) lbl.textContent = gkChk.checked ? 'Yes' : 'No';
      });
    }

    // Update perTeam default when numTeams changes
    const numTeamsInput = document.getElementById('tg-num-teams');
    const perTeamInput = document.getElementById('tg-per-team');
    if (numTeamsInput && perTeamInput) {
      numTeamsInput.addEventListener('change', () => {
        const training = getTrainings();
        const t = training.find(x => String(x.id) === String(detailTrainingId));
        if (!t) return;
        const players = getUsers().filter(u => (u.roles || []).includes('player'));
        const locked = isTrainingLocked(t);
        const teamFilterBtn = document.querySelector('[data-tg-team].tg-btn-active');
        const teamFilter = teamFilterBtn ? teamFilterBtn.dataset.tgTeam : 'all';
        let pool = players.filter(p => {
          const eff = getEffectiveAnswer(p.id, t, locked);
          return eff === 'yes' || eff === 'late';
        });
        if (teamFilter && teamFilter !== 'all') pool = pool.filter(p => p.team === teamFilter);
        const n = Math.max(2, parseInt(numTeamsInput.value) || 2);
        perTeamInput.value = Math.floor(pool.length / n) || 1;
      });
    }

    // Generate button
    const genBtn = document.getElementById('btn-tg-generate');
    if (genBtn) {
      genBtn.addEventListener('click', () => {
        const training = getTrainings();
        const t = training.find(x => String(x.id) === String(detailTrainingId));
        if (!t) return;
        const players = getUsers().filter(u => (u.roles || []).includes('player'));
        const locked = isTrainingLocked(t);
        const numTeams = Math.max(2, parseInt(document.getElementById('tg-num-teams').value) || 2);
        const perTeam = Math.max(1, parseInt(document.getElementById('tg-per-team').value) || 5);
        const includeGK = document.getElementById('tg-include-gk').checked;
        const teamFilterBtn = document.querySelector('[data-tg-team].tg-btn-active');
        const teamFilter = teamFilterBtn ? teamFilterBtn.dataset.tgTeam : 'all';
        const modeBtn = document.querySelector('[data-tg-mode].tg-btn-active');
        const mode = modeBtn ? modeBtn.dataset.tgMode : 'mix';

        _generatedTeams = generateTrainingTeams(players, t.date, locked, numTeams, perTeam, includeGK, teamFilter, mode);
        _generatedTeamsId = t.id;

        const container = document.getElementById('tg-teams-container');
        if (container) {
          container.innerHTML = renderGeneratedTeams(_generatedTeams, players, t.date, locked);
          bindGeneratedTeamsDnD(players, t.date, locked);
        }
        _refreshStdBoards(t.date);
      });
    }

    // Bind drag-and-drop if teams already rendered
    if (_generatedTeams && String(_generatedTeamsId) === String(detailTrainingId)) {
      const training = getTrainings();
      const t = training.find(x => String(x.id) === String(detailTrainingId));
      if (t) {
        const players = getUsers().filter(u => (u.roles || []).includes('player'));
        const locked = isTrainingLocked(t);
        bindGeneratedTeamsDnD(players, t.date, locked);
      }
    }
  }

  // ── Refresh the Tactical Boards section in staff training detail ──
  function _refreshStdBoards(tdate) {
    const section = document.getElementById('std-boards-section');
    if (!section) return;
    section.innerHTML = renderStdBoardsSection(tdate);
    // Re-init read-only board scaling + animations
    scaleRoBoards();
    bindRoBoardAnimations();
  }

  // ── Drag-and-drop + add/remove for generated teams ──
  function bindGeneratedTeamsDnD(allPlayers, sess, locked) {
    let dragPlayerId = null;
    let dragSourceTeamIdx = null;
    let _droppedOnTeam = false;

    function _rerender() {
      const container = document.getElementById('tg-teams-container');
      if (container) {
        container.innerHTML = renderGeneratedTeams(_generatedTeams, allPlayers, sess, locked);
        bindGeneratedTeamsDnD(allPlayers, sess, locked);
      }
      _refreshStdBoards(sess && sess.date);
    }

    document.querySelectorAll('.tg-player-row').forEach(row => {
      row.addEventListener('dragstart', e => {
        dragPlayerId = row.dataset.playerId;
        dragSourceTeamIdx = Number(row.closest('.tg-team-players').dataset.teamIdx);
        _droppedOnTeam = false;
        row.classList.add('tg-dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('tg-dragging');
        document.querySelectorAll('.tg-drop-active').forEach(el => el.classList.remove('tg-drop-active'));
        // If not dropped on any team zone, remove player from source team (→ goes to "No inclosos")
        if (!_droppedOnTeam && dragPlayerId != null && dragSourceTeamIdx != null) {
          _generatedTeams[dragSourceTeamIdx] = _generatedTeams[dragSourceTeamIdx].filter(
            p => String(p.id) !== String(dragPlayerId)
          );
          _rerender();
        }
        dragPlayerId = null;
        dragSourceTeamIdx = null;
      });
    });

    document.querySelectorAll('.tg-team-players').forEach(zone => {
      zone.addEventListener('dragover', e => {
        e.preventDefault();
        zone.classList.add('tg-drop-active');
      });
      zone.addEventListener('dragleave', () => {
        zone.classList.remove('tg-drop-active');
      });
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('tg-drop-active');
        _droppedOnTeam = true;
        const targetIdx = Number(zone.dataset.teamIdx);
        if (dragPlayerId == null) return;
        // If dragged from "No inclosos" (sentinel -1), just add to target
        if (dragSourceTeamIdx === -1) {
          const player = allPlayers.find(p => String(p.id) === String(dragPlayerId));
          if (!player) return;
          const alreadyAssigned = _generatedTeams.some(team => team.some(tp => String(tp.id) === String(player.id)));
          if (!alreadyAssigned) _generatedTeams[targetIdx].push(player);
          _rerender();
          return;
        }
        if (dragSourceTeamIdx === targetIdx) return;
        // Move player between teams
        const sourceTeam = _generatedTeams[dragSourceTeamIdx];
        const targetTeam = _generatedTeams[targetIdx];
        const pIdx = sourceTeam.findIndex(p => String(p.id) === String(dragPlayerId));
        if (pIdx === -1) return;
        const [player] = sourceTeam.splice(pIdx, 1);
        targetTeam.push(player);
        _rerender();
      });
    });

    // Remove player button (player goes to "No inclosos" automatically via re-render)
    document.querySelectorAll('.tg-remove-player').forEach(btn => {
      btn.addEventListener('click', () => {
        const ti = Number(btn.dataset.teamIdx);
        const pid = btn.dataset.playerId;
        _generatedTeams[ti] = _generatedTeams[ti].filter(p => String(p.id) !== String(pid));
        _rerender();
      });
    });

    // Add player — custom searchable dropdown
    document.querySelectorAll('.tg-dd').forEach(dd => {
      const input = dd.querySelector('.tg-dd-input');
      const list = dd.querySelector('.tg-dd-list');
      if (!input || !list) return;

      input.addEventListener('focus', () => {
        list.hidden = false;
        filterDDOptions('');
      });
      input.addEventListener('input', () => {
        list.hidden = false;
        filterDDOptions(input.value);
      });

      function filterDDOptions(q) {
        const term = q.toLowerCase().trim();
        list.querySelectorAll('.tg-dd-option').forEach(opt => {
          const name = (opt.querySelector('.tg-player-name-text') || {}).textContent || '';
          opt.style.display = name.toLowerCase().includes(term) ? '' : 'none';
        });
      }

      function addByName() {
        const val = input.value.trim();
        if (!val) return false;
        const ti = Number(dd.dataset.teamIdx);
        const term = val.toLowerCase();
        // Try exact match first, then startsWith, then includes
        let player = allPlayers.find(p => (p.name || '').toLowerCase() === term);
        if (!player) player = allPlayers.find(p => (p.name || '').toLowerCase().startsWith(term));
        if (!player) player = allPlayers.find(p => (p.name || '').toLowerCase().includes(term));
        // If no match, create an ad-hoc entry so any name can be added
        if (!player) {
          player = { id: 'custom_' + Date.now(), name: val, position: '', team: '', playerNumber: '', roles: [] };
        }
        const alreadyAssigned = _generatedTeams.some(team => team.some(tp => String(tp.id) === String(player.id)));
        if (alreadyAssigned) { input.value = ''; list.hidden = true; return false; }
        _generatedTeams[ti].push(player);
        _rerender();
        return true;
      }

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); addByName(); input.value = ''; list.hidden = true; }
        if (e.key === 'Escape') { list.hidden = true; input.blur(); }
      });

      input.addEventListener('blur', () => {
        // Try to add by name on blur, then close dropdown
        setTimeout(() => {
          addByName();
          list.hidden = true;
        }, 150);
      });

      list.querySelectorAll('.tg-dd-option').forEach(opt => {
        opt.addEventListener('mousedown', e => {
          e.preventDefault(); // prevent blur from firing
          const pid = opt.dataset.pid;
          const ti = Number(dd.dataset.teamIdx);
          const player = allPlayers.find(p => String(p.id) === String(pid));
          if (!player) return;
          const alreadyAssigned = _generatedTeams.some(team => team.some(tp => String(tp.id) === String(player.id)));
          if (alreadyAssigned) return;
          _generatedTeams[ti].push(player);
          _rerender();
        });
      });
    });

    // "No inclosos" drag into teams
    document.querySelectorAll('.tg-ni-player[draggable]').forEach(chip => {
      chip.addEventListener('dragstart', e => {
        dragPlayerId = chip.dataset.playerId;
        dragSourceTeamIdx = -1; // sentinel: from "no inclosos"
        _droppedOnTeam = false;
        chip.classList.add('tg-dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      chip.addEventListener('dragend', () => {
        chip.classList.remove('tg-dragging');
        document.querySelectorAll('.tg-drop-active').forEach(el => el.classList.remove('tg-drop-active'));
        dragPlayerId = null;
        dragSourceTeamIdx = null;
      });
    });
  }

  // ---------- Convocatòria drag-and-drop ----------
  function bindConvocatoria() {
    const availEl = document.getElementById('conv-available');
    const calledEl = document.getElementById('conv-called');
    if (!availEl || !calledEl) return;

    // Match selector (custom dropdown)
    const toggle = document.getElementById('conv-match-toggle');
    const dropdown = document.getElementById('conv-match-dropdown');
    if (toggle && dropdown) {
      toggle.addEventListener('click', () => {
        dropdown.hidden = !dropdown.hidden;
        toggle.classList.toggle('conv-match-toggle-open', !dropdown.hidden);
      });
      dropdown.querySelectorAll('.conv-match-option').forEach(opt => {
        opt.addEventListener('click', () => {
          convSelectedMatchId = Number(opt.dataset.mid) || null;
          renderPage(getSession());
        });
      });
      document.addEventListener('click', (e) => {
        if (!e.target.closest('#conv-match-selector')) { dropdown.hidden = true; toggle.classList.remove('conv-match-toggle-open'); }
      });
    }

    function getConvKey() { return convSelectedMatchId ? String(convSelectedMatchId) : null; }
    function getConvAll() {
      const raw = JSON.parse(localStorage.getItem('fa_convocatoria') || '{}');
      if (Array.isArray(raw)) { localStorage.setItem('fa_convocatoria', '{}'); return {}; }
      return raw;
    }
    function getSaved() {
      const all = getConvAll();
      const key = getConvKey();
      return key ? (all[key] || []) : [];
    }
    function setSaved(list) {
      const all = getConvAll();
      const key = getConvKey();
      if (!key) return;
      all[key] = list;
      localStorage.setItem('fa_convocatoria', JSON.stringify(all));
    }

    let dragId = null;

    function handleDragStart(e) {
      dragId = e.currentTarget.dataset.id;
      e.currentTarget.classList.add('conv-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
    }
    function handleDragEnd(e) {
      e.currentTarget.classList.remove('conv-dragging');
    }

    availEl.querySelectorAll('.conv-player').forEach(el => {
      el.addEventListener('dragstart', handleDragStart);
      el.addEventListener('dragend', handleDragEnd);
    });
    calledEl.querySelectorAll('.conv-player').forEach(el => {
      el.addEventListener('dragstart', handleDragStart);
      el.addEventListener('dragend', handleDragEnd);
    });

    // Tap-to-move for touch devices (drag-and-drop doesn't work on mobile)
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouchDevice) {
      availEl.querySelectorAll('.conv-player:not(.conv-player-unavailable)').forEach(el => {
        el.addEventListener('click', () => {
          const id = el.dataset.id;
          const saved = getSaved();
          if (!saved.includes(id)) { saved.push(id); setSaved(saved); }
          renderPage(getSession());
        });
      });
      calledEl.querySelectorAll('.conv-player').forEach(el => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('.conv-remove')) return; // let × button handle it
          const id = el.dataset.id;
          let saved = getSaved();
          saved = saved.filter(sid => String(sid) !== String(id));
          setSaved(saved);
          renderPage(getSession());
        });
      });
    }

    // Drop on called list → add player
    calledEl.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; calledEl.classList.add('conv-drop-active'); });
    calledEl.addEventListener('dragleave', () => calledEl.classList.remove('conv-drop-active'));
    calledEl.addEventListener('drop', e => {
      e.preventDefault();
      calledEl.classList.remove('conv-drop-active');
      if (!dragId) return;
      const saved = getSaved();
      if (!saved.includes(dragId)) { saved.push(dragId); setSaved(saved); }
      dragId = null;
      renderPage(getSession());
    });

    // Drop on available list → remove player
    availEl.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; availEl.classList.add('conv-drop-active'); });
    availEl.addEventListener('dragleave', () => availEl.classList.remove('conv-drop-active'));
    availEl.addEventListener('drop', e => {
      e.preventDefault();
      availEl.classList.remove('conv-drop-active');
      if (!dragId) return;
      let saved = getSaved();
      saved = saved.filter(id => String(id) !== String(dragId));
      setSaved(saved);
      dragId = null;
      renderPage(getSession());
    });

    // Remove button (×)
    calledEl.querySelectorAll('.conv-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        let saved = getSaved();
        saved = saved.filter(sid => String(sid) !== String(id));
        setSaved(saved);
        renderPage(getSession());
      });
    });

    // Save button
    const saveBtn = document.getElementById('btn-conv-save');
    const clearBtn = document.getElementById('btn-conv-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (!convSelectedMatchId) return;
        setSaved([]);
        renderPage(getSession());
      });
    }
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        // If already sent, auto-update the sent data too
        const sentData = JSON.parse(localStorage.getItem('fa_convocatoria_sent') || '{}');
        if (convSelectedMatchId && sentData[convSelectedMatchId]) {
          const calledEls = document.querySelectorAll('#conv-called .conv-player');
          const list = Array.from(calledEls).map(el => el.dataset.id);
          if (list.length) {
            setSaved(list);
            const uniformData = JSON.parse(localStorage.getItem('fa_convocatoria_uniform') || '{}');
            const curU = uniformData[convSelectedMatchId] || { jersey: 'white', socks: 'striped' };
            const vData = JSON.parse(localStorage.getItem('fa_convocatoria_videos') || '{}');
            const videos = vData[convSelectedMatchId] || [];
            sentData[convSelectedMatchId] = { players: list, jersey: curU.jersey, socks: curU.socks, videos: videos };
            localStorage.setItem('fa_convocatoria_sent', JSON.stringify(sentData));
          }
        }
        saveBtn.textContent = t('misc.saved');
        saveBtn.classList.remove('btn-outline');
        saveBtn.classList.add('btn-accent');
        setTimeout(() => {
          saveBtn.textContent = t('btn.save');
          saveBtn.classList.add('btn-outline');
          saveBtn.classList.remove('btn-accent');
        }, 1200);
      });
    }

    // Send / Unsend toggle button
    const sendBtn = document.getElementById('btn-conv-send');
    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        if (!convSelectedMatchId) return;
        const sentData = JSON.parse(localStorage.getItem('fa_convocatoria_sent') || '{}');
        const isUnsend = sendBtn.classList.contains('btn-danger');
        if (isUnsend) {
          // Unsend
          delete sentData[convSelectedMatchId];
          localStorage.setItem('fa_convocatoria_sent', JSON.stringify(sentData));
        } else {
          // Auto-save then send
          const calledEls = document.querySelectorAll('#conv-called .conv-player');
          const list = Array.from(calledEls).map(el => el.dataset.id);
          if (!list.length) return;
          setSaved(list);
          const uniformData = JSON.parse(localStorage.getItem('fa_convocatoria_uniform') || '{}');
          const curU = uniformData[convSelectedMatchId] || { jersey: 'white', socks: 'striped' };
          const vData = JSON.parse(localStorage.getItem('fa_convocatoria_videos') || '{}');
          const videos = vData[convSelectedMatchId] || [];
          sentData[convSelectedMatchId] = { players: list, jersey: curU.jersey, socks: curU.socks, videos: videos };
          localStorage.setItem('fa_convocatoria_sent', JSON.stringify(sentData));

          // Push notification to called-up players
          const matches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
          const matchObj = matches.find(m => String(m.id) === String(convSelectedMatchId));
          const matchLabel = matchObj ? (matchObj.home + ' vs ' + matchObj.away) : 'Proper partit';
          const teamId = _currentSession && _currentSession.teamId && _currentSession.teamId !== 'none' ? _currentSession.teamId : null;
          if (!teamId) { console.warn('No valid teamId for push'); }
          // Map roster IDs to Firebase UIDs (skip seeded/fake users with numeric IDs)
          const allUsers = getUsers();
          const targetUids = list.map(pid => {
            const u = allUsers.find(x => String(x.id) === String(pid));
            if (!u) return null;
            // Only include real Firebase Auth users (string UIDs, not numeric seed IDs)
            const id = String(u.id);
            return (id && isNaN(Number(id))) ? id : null;
          }).filter(Boolean);
          Push.sendToPlayers(teamId, targetUids, {
            type: 'convocatoria',
            title: '\u26BD Convocatòria publicada!',
            body: matchLabel + (matchObj && matchObj.date ? ' · ' + matchObj.date : ''),
            page: 'convocatoria',
            matchId: String(convSelectedMatchId)
          });
        }
        renderPage(getSession());
      });
    }

    // Uniform toggle bindings
    document.querySelectorAll('.conv-jersey-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.conv-jersey-opt').forEach(b => b.classList.remove('uniform-opt-active'));
        btn.classList.add('uniform-opt-active');
        if (!convSelectedMatchId) return;
        const uniformData = JSON.parse(localStorage.getItem('fa_convocatoria_uniform') || '{}');
        if (!uniformData[convSelectedMatchId]) uniformData[convSelectedMatchId] = {};
        uniformData[convSelectedMatchId].jersey = btn.dataset.val;
        localStorage.setItem('fa_convocatoria_uniform', JSON.stringify(uniformData));
      });
    });
    document.querySelectorAll('.conv-socks-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.conv-socks-opt').forEach(b => b.classList.remove('uniform-opt-active'));
        btn.classList.add('uniform-opt-active');
        if (!convSelectedMatchId) return;
        const uniformData = JSON.parse(localStorage.getItem('fa_convocatoria_uniform') || '{}');
        if (!uniformData[convSelectedMatchId]) uniformData[convSelectedMatchId] = {};
        uniformData[convSelectedMatchId].socks = btn.dataset.val;
        localStorage.setItem('fa_convocatoria_uniform', JSON.stringify(uniformData));
      });
    });

    // Call-up time binding
    const callupSel = document.getElementById('conv-callup-time');
    if (callupSel) {
      callupSel.addEventListener('change', () => {
        if (!convSelectedMatchId) return;
        // Save to dedicated convocatòria callup storage
        const convCallupData = JSON.parse(localStorage.getItem('fa_convocatoria_callup') || '{}');
        convCallupData[convSelectedMatchId] = callupSel.value;
        localStorage.setItem('fa_convocatoria_callup', JSON.stringify(convCallupData));
        // Also update fa_matches for display in match detail
        const matches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
        const m = matches.find(x => x.id === convSelectedMatchId);
        if (m) {
          m.callupTime = callupSel.value;
          localStorage.setItem('fa_matches', JSON.stringify(matches));
        }
      });
    }

    // Video links bindings
    function saveConvVideos() {
      if (!convSelectedMatchId) return;
      const vData = JSON.parse(localStorage.getItem('fa_convocatoria_videos') || '{}');
      const rows = document.querySelectorAll('.conv-video-row');
      const videos = [];
      rows.forEach((row, i) => {
        const title = row.querySelector('.conv-video-title').value.trim();
        const url = row.querySelector('.conv-video-url').value.trim();
        const commentEl = document.querySelector('.conv-video-comment[data-video-idx="' + i + '"]');
        const comment = commentEl ? commentEl.value.trim() : '';
        if (title || url) videos.push({ title: title || 'Video', url, comment });
      });
      vData[convSelectedMatchId] = videos;
      localStorage.setItem('fa_convocatoria_videos', JSON.stringify(vData));
      // Re-render to show/hide comment textareas when title changes
      renderPage(getSession());
    }
    const addVideoBtn = document.getElementById('btn-conv-add-video');
    if (addVideoBtn) {
      addVideoBtn.addEventListener('click', () => {
        const list = document.getElementById('conv-video-list');
        if (!list) return;
        const idx = list.querySelectorAll('.conv-video-row').length;
        const row = document.createElement('div');
        row.className = 'conv-video-row';
        row.dataset.videoIdx = idx;
        row.innerHTML = '<input type="text" class="reg-input conv-video-title" value="" placeholder="Title" style="flex:1;min-width:80px;">' +
          '<input type="text" class="reg-input conv-video-url" value="" placeholder="Paste URL" style="flex:2;min-width:140px;">' +
          '<button class="btn btn-small conv-video-remove" style="background:#c62828;color:#fff;border:none;padding:.2rem .5rem;">✕</button>';
        list.appendChild(row);
        row.querySelector('.conv-video-title').addEventListener('blur', saveConvVideos);
        row.querySelector('.conv-video-url').addEventListener('blur', saveConvVideos);
        row.querySelector('.conv-video-remove').addEventListener('click', () => { row.remove(); saveConvVideos(); });
      });
    }
    document.querySelectorAll('.conv-video-row').forEach(row => {
      row.querySelector('.conv-video-title')?.addEventListener('blur', saveConvVideos);
      row.querySelector('.conv-video-url')?.addEventListener('blur', saveConvVideos);
      row.querySelector('.conv-video-remove')?.addEventListener('click', () => { row.remove(); saveConvVideos(); });
    });
    // Per-video comment textareas auto-save
    document.querySelectorAll('.conv-video-comment').forEach(ta => {
      ta.addEventListener('blur', () => {
        if (!convSelectedMatchId) return;
        const vData = JSON.parse(localStorage.getItem('fa_convocatoria_videos') || '{}');
        const videos = vData[convSelectedMatchId] || [];
        const idx = Number(ta.dataset.videoIdx);
        if (videos[idx]) { videos[idx].comment = ta.value.trim(); }
        vData[convSelectedMatchId] = videos;
        localStorage.setItem('fa_convocatoria_videos', JSON.stringify(vData));
      });
    });
  }

  // #endregion Matchday, Calendar & Convocatòria

  // #region Notifications & Body Map
  // ---------- Staff Notifications ----------
  // ---------- In-app push toast ----------
  function _showPushToast(title, body) {
    let container = document.getElementById('push-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'push-toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'push-toast';
    toast.innerHTML = `<strong>${title}</strong><span>${body}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }

  // ---------- Acknowledged saves (player-submitted data) ----------
  // Writes localStorage synchronously (instant UI), then waits for the
  // Firestore SERVER ack. Three outcomes on the tapped element:
  //   save-pending  → spinner while waiting
  //   save-confirmed → server acknowledged the write
  //   save-queued   → no ack within 4s (offline/slow): Firestore persistence
  //                   will deliver it, unless persistence failed (multi-tab),
  //                   where we warn the player loudly.
  // Rejected writes surface through the 'db-write-error' listener below.
  function _ackUi(p, el) {
    if (el) { el.classList.add('save-pending'); el.classList.remove('save-confirmed', 'save-queued'); }
    const timeout = new Promise(res => setTimeout(() => res('timeout'), 4000));
    return Promise.race([p.then(() => 'ok', () => 'error'), timeout]).then(result => {
      if (el) el.classList.remove('save-pending');
      if (result === 'ok') {
        if (el) {
          el.classList.add('save-confirmed');
          setTimeout(() => el.classList.remove('save-confirmed'), 1500);
        }
      } else if (result === 'timeout') {
        if (window._persistenceFailed || !navigator.onLine) {
          _showPushToast(t('save.sync_title'), t('save.queued'));
        }
        if (el) el.classList.add('save-queued');
        // Upgrade the indicator when the ack eventually arrives.
        p.then(() => {
          if (el) {
            el.classList.remove('save-queued');
            el.classList.add('save-confirmed');
            setTimeout(() => el.classList.remove('save-confirmed'), 1500);
          }
        }).catch(() => { if (el) el.classList.remove('save-queued'); });
      }
      // result === 'error' → toast shown by the db-write-error listener
      return result;
    });
  }

  /** Acked save of a legacy synced localStorage key. */
  function ackSave(key, value, el) {
    return _ackUi(DB.setItemAcked(key, value), el);
  }

  /**
   * Player-submitted record save: updates the localStorage blob (a
   * local-only read cache since Phase 3b — no longer mirrored to any
   * legacy doc) AND writes the canonical per-record doc — the ack UI
   * tracks the record.
   */
  function ackSaveRecord(coll, docId, data, legacyKey, legacyValue, el) {
    localStorage.setItem(legacyKey, legacyValue);
    return _ackUi(DB.submit(coll, docId, data), el);
  }

  /** Record delete (un-answer flows); same local-cache update. */
  function ackRemoveRecord(coll, docId, legacyKey, legacyValue, el) {
    localStorage.setItem(legacyKey, legacyValue);
    return _ackUi(DB.removeRecord(coll, docId), el);
  }

  window.addEventListener('db-write-error', (e) => {
    const code = e.detail && e.detail.code;
    if (code === 'permission-denied') {
      _showPushToast(t('save.sync_title'), t('save.error_perms'));
    } else {
      _showPushToast(t('save.sync_title'), t('save.error'));
    }
  });

  function getStaffNotifications() {
    return JSON.parse(localStorage.getItem('fa_staff_notifications') || '[]');
  }
  function saveStaffNotifications(list) {
    localStorage.setItem('fa_staff_notifications', JSON.stringify(list));
  }
  function addStaffNotification(notif) {
    const list = getStaffNotifications();
    // Stamp who the notification is about so staff pages can scope by
    // category. Almost every caller is the player submitting their own
    // answer, so the session is the right default; staff-logged events pass
    // an explicit uid. Notifications written before this existed have
    // neither, and stay visible to everyone rather than disappearing.
    const session = getSession();
    const uid = notif.uid || (session ? session.id : '');
    const subject = uid ? getUsers().find(u => String(u.id) === String(uid)) : null;
    list.unshift({
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      type: notif.type,
      uid: uid || '',
      category: (subject && subject.category) || '',
      playerName: notif.playerName,
      detail: notif.detail,
      activity: notif.activity,
      timestamp: new Date().toISOString(),
      read: false
    });
    // keep max 200 notifications
    if (list.length > 200) list.length = 200;
    saveStaffNotifications(list);
    updateStaffNotifBadge();
  }
  /**
   * Is this notification one of mine to see? Scoped to the categories the
   * staff member covers — not the currently selected one, so the sidebar
   * badge doesn't change every time they flip the category bar.
   * Entries with no category (written before notifications carried one) stay
   * visible to everyone; hiding them would silently swallow real history.
   */
  function inMyNotifScope(n) {
    if (!n || !n.category) return true;
    var visible = getVisibleCategories();
    if (!visible.length) return false;
    return visible.indexOf(n.category) !== -1;
  }

  function getUnreadStaffNotifCount() {
    return getStaffNotifications().filter(n => !n.read && inMyNotifScope(n)).length;
  }
  function updateStaffNotifBadge() {
    const nc = getUnreadStaffNotifCount();
    const el = document.querySelector('.sidebar-item[data-page="staff-notifications"] .sidebar-badge');
    if (el) {
      if (nc > 0) { el.textContent = nc; }
      else { el.remove(); }
    } else if (nc > 0) {
      const item = document.querySelector('.sidebar-item[data-page="staff-notifications"]');
      if (item) item.insertAdjacentHTML('beforeend', `<span class="sidebar-badge">${nc}</span>`);
    }
  }

  // ---------- Medical body map popup ----------
  function bindMedicalBodyPopup() {
    let popup = document.getElementById('medical-body-popup');
    if (popup) popup.remove();
    popup = document.createElement('div');
    popup.id = 'medical-body-popup';
    popup.className = 'medical-body-popup';
    // Build image + SVG overlay
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:inline-block;line-height:0;';
    var img = document.createElement('img');
    img.src = 'img/cuerpos.png'; img.alt = 'Body map';
    img.style.cssText = 'display:block;width:300px;height:auto;border-radius:8px;';
    wrap.appendChild(img);
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    BODY_ZONES.forEach(function(z) {
      var poly = document.createElementNS(svgNS, 'polygon');
      poly.setAttribute('points', z.pts);
      poly.style.cssText = 'fill:transparent;stroke:transparent;transition:fill .2s,stroke .2s;';
      // Tag each polygon with its group names for matching
      poly.dataset.groups = z.groups.join('|');
      svg.appendChild(poly);
    });
    wrap.appendChild(svg);
    popup.appendChild(wrap);
    document.body.appendChild(popup);

    const OFFSET = 16;
    const activeInjuries = getActiveInjuries();
    const injZoneByPlayer = {};
    activeInjuries.forEach(inj => { if (inj.bodyZone != null) injZoneByPlayer[inj.playerId] = inj.bodyZone; });
    // Fallback to fa_injury_zone for players without fa_injuries records
    const zoneMapFallback = JSON.parse(localStorage.getItem('fa_injury_zone') || '{}');
    document.querySelectorAll('.medical-injury').forEach(el => {
      el.addEventListener('mouseenter', e => {
        var playerId = el.closest('.medical-row') ? el.closest('.medical-row').dataset.playerId : null;
        var zIdx = playerId != null ? (injZoneByPlayer[playerId] != null ? injZoneByPlayer[playerId] : zoneMapFallback[playerId]) : null;
        // Highlight only the specific zone that was selected
        svg.querySelectorAll('polygon').forEach(function(poly, i) {
          if (zIdx != null && i === zIdx) {
            poly.style.fill = 'rgba(239,83,80,.4)';
            poly.style.stroke = '#ef5350';
            poly.style.strokeWidth = '.6';
          } else {
            poly.style.fill = 'transparent';
            poly.style.stroke = 'transparent';
          }
        });
        popup.classList.add('visible');
        positionPopup(e);
      });
      el.addEventListener('mousemove', positionPopup);
      el.addEventListener('mouseleave', () => {
        popup.classList.remove('visible');
        svg.querySelectorAll('polygon').forEach(function(poly) {
          poly.style.fill = 'transparent';
          poly.style.stroke = 'transparent';
        });
      });
    });
    function positionPopup(e) {
      const pw = popup.offsetWidth || 316;
      const ph = popup.offsetHeight || 420;
      let x = e.clientX + OFFSET;
      let y = e.clientY - ph / 2;
      if (x + pw > window.innerWidth - 8) x = e.clientX - pw - OFFSET;
      if (y < 8) y = 8;
      if (y + ph > window.innerHeight - 8) y = window.innerHeight - ph - 8;
      popup.style.left = x + 'px';
      popup.style.top = y + 'px';
    }
  }

  // ---------- Shared muscle data ----------
  // BODY_REGIONS, GROUP_SUBS → utils.js

  // Shared commit helper for injury pickers
  function commitInjuryNote(sid, musclePath, desc, zoneIdx) {
    const session = getSession();
    const sess = getTrainings().find(x => String(x.id) === String(sid));
    if (!sess) return;
    const date = sess.date;
    const injNotes = JSON.parse(localStorage.getItem('fa_injury_notes') || '{}');
    const note = musclePath + (desc ? ' – ' + desc : '');
    const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
    const key = recordKey(session.id, sess, 'avail');
    availData[key] = 'injured';
    ackSaveRecord('trainingAvail', key,
      { uid: session.id, sessionId: sess.id, date: date, value: 'injured' },
      'fa_training_availability', JSON.stringify(availData), null);
    injNotes[session.id] = note;
    ackSave('fa_injury_notes', JSON.stringify(injNotes), null);
    // Store which body zone polygon was selected
    if (zoneIdx != null) {
      const zoneMap = JSON.parse(localStorage.getItem('fa_injury_zone') || '{}');
      zoneMap[session.id] = zoneIdx;
      ackSave('fa_injury_zone', JSON.stringify(zoneMap), null);
    }
    const users = getUsers();
    const u = users.find(x => x.id === session.id);
    if (u) { u.fitnessStatus = 'injured'; u.injuryNote = note; saveUsers(users); }
    // Also create / update fa_injuries record
    const parenMatch = musclePath.match(/^(.+?)\s*\((.+?)\)$/);
    let mGroup = '', mSub = '';
    if (parenMatch) { mSub = parenMatch[1].trim(); mGroup = parenMatch[2].trim(); }
    else { mGroup = musclePath; }
    const zLabel = zoneIdx != null && BODY_ZONES[zoneIdx] ? BODY_ZONES[zoneIdx].label : '';
    // Check if player already has an active injury
    const injuries = getInjuries();
    const existing = injuries.find(inj => inj.playerId === session.id && inj.status === 'active');
    if (existing) {
      existing.bodyZone = zoneIdx; existing.bodyZoneLabel = zLabel;
      existing.muscleGroup = mGroup || zLabel || 'Injury';
      existing.muscleSub = mSub; existing.description = desc || '';
      saveInjuries(injuries);
    } else {
      addInjury({
        playerId: session.id,
        bodyZone: zoneIdx, bodyZoneLabel: zLabel,
        muscleGroup: mGroup || zLabel || 'Injury',
        muscleSub: mSub, description: desc || '',
        severity: 'moderate', status: 'active',
        startDate: date, expectedReturn: null, endDate: null,
        createdBy: session.id, notes: ''
      });
    }
    const training = getTrainings();
    const tObj = training.find(t => t.date === date);
    addStaffNotification({
      type: 'training_avail',
      playerName: session.name || '?',
      detail: 'Injured – ' + note,
      activity: (tObj && tObj.focus ? tObj.focus : 'Training') + ' (' + date + ')'
    });
    renderPage(session);
    updateActionsBadge();
  }

  // ---------- Body zone polygons ----------
  // BODY_ZONES → utils.js

  // ---------- Interactive body map picker ----------
  function showBodyMapPicker(btnsWrap, sid) {
    // Build overlay
    var overlay = document.createElement('div');
    overlay.className = 'body-map-overlay';
    var modal = document.createElement('div');
    modal.className = 'body-map-modal';
    modal.innerHTML = '<div class="body-map-header"><span>🏥 Select injured area</span>' +
      '<button class="body-map-close">&times;</button></div>';

    // Image container with SVG polygon overlay
    var container = document.createElement('div');
    container.className = 'body-map-container';
    // Inner wrapper so SVG sits exactly on top of the image
    var imgWrap = document.createElement('div');
    imgWrap.className = 'body-map-img-wrap';
    var img = document.createElement('img');
    img.src = 'img/cuerpos.png'; img.className = 'body-map-img'; img.draggable = false;
    imgWrap.appendChild(img);

    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.classList.add('body-map-svg');

    var tip = document.createElement('div');
    tip.className = 'body-zone-tip';

    BODY_ZONES.forEach(function (z, i) {
      var poly = document.createElementNS(svgNS, 'polygon');
      poly.setAttribute('points', z.pts);
      poly.dataset.idx = i;
      poly.classList.add('body-zone-poly');
      poly.addEventListener('mouseenter', function () { tip.textContent = z.label; tip.style.display = 'block'; });
      poly.addEventListener('mousemove', function (e) {
        var r = imgWrap.getBoundingClientRect();
        tip.style.left = (e.clientX - r.left + 12) + 'px';
        tip.style.top = (e.clientY - r.top - 28) + 'px';
      });
      poly.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
      svg.appendChild(poly);
    });
    imgWrap.appendChild(svg);
    imgWrap.appendChild(tip);
    container.appendChild(imgWrap);
    modal.appendChild(container);

    // Choice panel (hidden initially)
    var choicePanel = document.createElement('div');
    choicePanel.className = 'body-map-choice';
    choicePanel.style.display = 'none';
    modal.appendChild(choicePanel);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close
    function closeOverlay() { overlay.remove(); btnsWrap.style.display = ''; }
    modal.querySelector('.body-map-close').addEventListener('click', closeOverlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeOverlay(); });
    function onEsc(e) { if (e.key === 'Escape') { closeOverlay(); document.removeEventListener('keydown', onEsc); } }
    document.addEventListener('keydown', onEsc);
    btnsWrap.style.display = 'none';

    // Zone interaction (click to select, click again to deselect)
    var activePoly = null;
    svg.querySelectorAll('.body-zone-poly').forEach(function (poly) {
      poly.addEventListener('click', function () {
        if (activePoly === poly) {
          // Deselect
          poly.classList.remove('body-zone-active');
          activePoly = null;
          choicePanel.style.display = 'none';
          choicePanel.innerHTML = '';
          return;
        }
        if (activePoly) activePoly.classList.remove('body-zone-active');
        poly.classList.add('body-zone-active');
        activePoly = poly;
        var z = BODY_ZONES[parseInt(poly.dataset.idx)];
        buildChoicePanel(z.groups);
      });
    });

    function buildChoicePanel(groups) {
      choicePanel.style.display = '';
      var html = '<div class="body-map-choice-row">';
      // Group selector
      if (groups.length > 1) {
        html += '<select class="body-map-group-sel">';
        groups.forEach(function (g) { html += '<option value="' + sanitize(g) + '">' + sanitize(g) + '</option>'; });
        html += '</select>';
      } else {
        html += '<span class="body-map-group-label">' + sanitize(groups[0]) + '</span>';
      }
      // Sub-muscle dropdown
      html += '<select class="body-map-sub-sel"><option value="">— General —</option>';
      (GROUP_SUBS[groups[0]] || []).forEach(function (s) {
        html += '<option value="' + sanitize(s) + '">' + sanitize(s) + '</option>';
      });
      html += '</select>';
      // Description + OK
      html += '<input type="text" class="body-map-desc" placeholder="Describe injury…" maxlength="120">';
      html += '<button class="body-map-ok">OK</button>';
      html += '</div>';
      choicePanel.innerHTML = html;

      // Update sub-muscles when group changes
      var groupSel = choicePanel.querySelector('.body-map-group-sel');
      var subSel = choicePanel.querySelector('.body-map-sub-sel');
      if (groupSel) {
        groupSel.addEventListener('change', function () {
          var g = groupSel.value;
          var opts = '<option value="">— General —</option>';
          (GROUP_SUBS[g] || []).forEach(function (s) {
            opts += '<option value="' + sanitize(s) + '">' + sanitize(s) + '</option>';
          });
          subSel.innerHTML = opts;
        });
      }
      // Commit
      function doCommit() {
        var group = groupSel ? groupSel.value : choicePanel.querySelector('.body-map-group-label').textContent;
        var sub = subSel.value;
        var desc = choicePanel.querySelector('.body-map-desc').value.trim();
        var musclePath = sub ? (sub + ' (' + group + ')') : group;
        var zoneIdx = activePoly ? parseInt(activePoly.dataset.idx) : null;
        overlay.remove();
        commitInjuryNote(sid, musclePath, desc, zoneIdx);
      }
      choicePanel.querySelector('.body-map-ok').addEventListener('click', doCommit);
      choicePanel.querySelector('.body-map-desc').addEventListener('keydown', function (e) { if (e.key === 'Enter') doCommit(); });
      choicePanel.querySelector('.body-map-desc').focus();
    }
  }

  // #endregion Notifications & Body Map

  // #region Medical
  // ---------- Medical ----------
  let _medicalFilterState = 'all'; // synced to medicalFilter

  function renderMedical() {
    const users = getUsers();
    // Scope to the selected category. Medical is the most sensitive page in
    // the app and used to show every injured player in the club to any staff
    // member; injuries carry no category of their own, so they are filtered
    // through the player they belong to.
    const curCat = getCurrentCategory();
    const players = users.filter(u => (u.roles || []).includes('player')
      && (!curCat || (u.category || '') === curCat)
      && (medicalTeamFilter === 'all' || (u.team || '') === medicalTeamFilter));
    const inScope = {};
    players.forEach(p => { inScope[String(p.id)] = true; });
    // Always filter through the in-scope players — an injury has no category
    // or team of its own. (This used to short-circuit on `!curCat`, which let
    // the whole club's injuries through whenever "Totes" was selected and
    // made the team filter below a no-op for the lead.)
    const injuries = getInjuries().filter(i => inScope[String(i.playerId)]);
    const now = new Date();
    const todayStr = localDateStr(now);
    const seasonStart = seasonStartStr(now);
    // The season window is for HISTORY only — season totals, average recovery,
    // past injuries, analytics. "Currently active" is a statement about now,
    // so an unresolved injury that started before 15 August still belongs in
    // the list; excluding it was one reason these counters disagreed with
    // "Estat físic de l'equip", which never applied the window.
    const seasonInjuries = injuries.filter(i => i.startDate >= seasonStart);

    const activeInj = injuries.filter(i => i.status === 'active');
    const recoveringInj = injuries.filter(i => i.status === 'recovering');
    const resolvedInj = seasonInjuries.filter(i => i.status === 'resolved');

    // Avg recovery time (resolved injuries only)
    let avgRecovery = 0;
    if (resolvedInj.length) {
      const totalDays = resolvedInj.reduce((sum, inj) => {
        const s = new Date(inj.startDate + 'T12:00:00');
        const e = new Date((inj.endDate || todayStr) + 'T12:00:00');
        return sum + Math.max(1, Math.floor((e - s) / 86400000) + 1);
      }, 0);
      avgRecovery = Math.round(totalDays / resolvedInj.length);
    }

    // Build player status map
    const playerStatusMap = {};
    const playerNoteMap = {};
    const _medFitCtx = fitnessContext();
    players.forEach(p => {
      const d = deriveFitnessStatus(p.id, false, _medFitCtx);
      playerStatusMap[p.id] = d.fitnessStatus;
      playerNoteMap[p.id] = d.injuryNote || '';
    });

    // Players whose training-availability answers mark them injured/doubt but
    // who have no unresolved record in fa_injuries. They counted in the tiles
    // above yet appeared nowhere in the list below — the other half of why the
    // numbers disagreed. Surfaced so staff can see who still needs logging.
    const loggedPlayerIds = {};
    [].concat(activeInj, recoveringInj)
      .forEach(i => { loggedPlayerIds[String(i.playerId)] = true; });
    const selfReported = players.filter(p =>
      (playerStatusMap[p.id] === 'injured' || playerStatusMap[p.id] === 'doubt') &&
      !loggedPlayerIds[String(p.id)]);

    // Squad grid
    const filter = medicalFilter;
    const filteredPlayers = players.filter(p => {
      if (filter === 'all') return true;
      return playerStatusMap[p.id] === filter || (filter === 'recovering' && playerStatusMap[p.id] === 'doubt');
    }).sort((a, b) => {
      const order = { injured: 0, doubt: 1, fit: 2 };
      const diff = (order[playerStatusMap[a.id]] ?? 2) - (order[playerStatusMap[b.id]] ?? 2);
      return diff !== 0 ? diff : posRankGlobal(a) - posRankGlobal(b);
    });

    const gridHtml = filteredPlayers.map(p => {
      const st = playerStatusMap[p.id];
      const posHtml = posCirclesHtmlGlobal(p);
      const teamCircle = p.team ? '<span class="conv-team-circle">' + sanitize(p.team) + '</span>' : '';
      let borderColor = '#43a047'; // fit green
      let statusLabel = t('medical.status_fit');
      let statusClass = 'fit';
      let injExcerpt = '';
      if (st === 'injured') {
        borderColor = '#e53935'; statusLabel = t('medical.status_injured'); statusClass = 'injured';
        const pInj = activeInj.find(i => i.playerId === p.id);
        if (pInj) {
          const days = Math.max(0, Math.floor((now - new Date(pInj.startDate + 'T12:00:00')) / 86400000));
          injExcerpt = '<div class="med-card-injury">' + sanitize(pInj.muscleGroup || t('fitness.injury')) + ' · ' + days + 'd</div>';
        }
      } else if (st === 'doubt') {
        borderColor = '#f9a825'; statusLabel = t('medical.status_recovering'); statusClass = 'recovering';
        const pInj = recoveringInj.find(i => i.playerId === p.id);
        if (pInj) injExcerpt = '<div class="med-card-injury" style="color:#f9a825;">' + sanitize(pInj.muscleGroup || t('medical.recovering')) + '</div>';
      }
      // No logged record (self-reported through availability): fall back to
      // the derived note so the card never shows a status with no explanation.
      if (!injExcerpt && st !== 'fit' && playerNoteMap[p.id]) {
        injExcerpt = '<div class="med-card-injury" style="opacity:.75;font-style:italic;">' +
          sanitize(playerNoteMap[p.id]) + '</div>';
      }
      return '<div class="med-player-card" data-player-id="' + p.id + '" style="border-left:4px solid ' + borderColor + ';">' +
        '<div class="med-card-top">' +
          '<span class="conv-pos-circles">' + posHtml + '</span>' +
          '<span class="med-card-name">' + sanitize(p.name) + teamCircle + '</span>' +
          '<span class="med-status-dot med-status-' + statusClass + '" title="' + statusLabel + '"></span>' +
        '</div>' +
        injExcerpt +
      '</div>';
    }).join('');

    // Active injuries cards
    let activeHtml = '';
    if (!activeInj.length && !recoveringInj.length && !selfReported.length) {
      activeHtml = '<div class="empty-state" style="padding:1.5rem;"><div class="empty-icon">💪</div><p>' + t('medical.no_active') + '</p></div>';
    } else {
      const combined = [...activeInj, ...recoveringInj].sort((a, b) => {
        const da = Math.floor((now - new Date(a.startDate + 'T12:00:00')) / 86400000);
        const db2 = Math.floor((now - new Date(b.startDate + 'T12:00:00')) / 86400000);
        return db2 - da;
      });
      activeHtml = combined.map(inj => {
        const p = players.find(x => x.id === inj.playerId);
        if (!p) return '';
        const posHtml = posCirclesHtmlGlobal(p);
        const teamCircle = p.team ? '<span class="conv-team-circle">' + sanitize(p.team) + '</span>' : '';
        const days = Math.max(0, Math.floor((now - new Date(inj.startDate + 'T12:00:00')) / 86400000));
        const durationStr = days === 0 ? t('medical.today') : days === 1 ? '1 day' : days + ' days';
        const sinceStr = tDateDayMonth(inj.startDate);
        const sevColors = { minor: '#43a047', moderate: '#f9a825', severe: '#e53935' };
        const sevColor = sevColors[inj.severity] || '#999';
        const sevLabel = inj.severity ? inj.severity.charAt(0).toUpperCase() + inj.severity.slice(1) : 'Unknown';
        let returnHtml = '';
        if (inj.expectedReturn) {
          const retD = new Date(inj.expectedReturn + 'T12:00:00');
          const retDays = Math.max(0, Math.ceil((retD - now) / 86400000));
          returnHtml = '<span class="med-return-badge">' + (retDays <= 0 ? t('medical.due_back') : '~' + retDays + t('medical.days_to_return')) + '</span>';
        }
        const statusBadge = inj.status === 'recovering'
          ? '<span class="med-severity-badge" style="background:#f9a825;color:#333;">' + t('medical.recovering') + '</span>'
          : '<span class="med-severity-badge" style="background:' + sevColor + ';">' + sanitize(sevLabel) + '</span>';
        const zoneLabel = inj.muscleGroup ? sanitize(inj.muscleGroup) + (inj.muscleSub ? ' (' + sanitize(inj.muscleSub) + ')' : '') : 'Unknown area';
        return '<div class="med-injury-card" data-player-id="' + p.id + '" data-injury-id="' + inj.id + '">' +
          '<div class="med-inj-card-top">' +
            '<div class="med-inj-player">' +
              '<span class="conv-pos-circles">' + posHtml + '</span>' +
              '<span class="med-card-name">' + sanitize(p.name) + teamCircle + '</span>' +
            '</div>' +
            statusBadge +
          '</div>' +
          '<div class="med-inj-body">' +
            '<div class="med-inj-zone">' + zoneLabel + '</div>' +
            (inj.description ? '<div class="med-inj-desc">' + sanitize(inj.description) + '</div>' : '') +
          '</div>' +
          '<div class="med-inj-footer">' +
            '<div class="med-inj-duration"><span class="medical-since">' + t('medical.since') + ' ' + sinceStr + '</span><span class="medical-days">' + durationStr + '</span></div>' +
            returnHtml +
            '<div class="med-inj-actions">' +
              (inj.status === 'active' ? '<button class="btn btn-small med-btn-recover" data-inj-id="' + inj.id + '">' + t('medical.mark_recovering') + '</button>' : '') +
              '<button class="btn btn-small med-btn-resolve" data-inj-id="' + inj.id + '">' + t('medical.mark_resolved') + '</button>' +
              '<button class="btn btn-small btn-ghost med-btn-edit" data-inj-id="' + inj.id + '">' + t('common.edit') + '</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      // Self-reported, not yet logged. Lighter cards, listed after the real
      // records, each offering to open the logger with the player preselected.
      activeHtml += selfReported.map(p => {
        const st = playerStatusMap[p.id];
        const posHtml = posCirclesHtmlGlobal(p);
        const teamCircle = p.team ? '<span class="conv-team-circle">' + sanitize(p.team) + '</span>' : '';
        const badgeColor = st === 'injured' ? '#e53935' : '#f9a825';
        const badgeText = st === 'injured' ? t('medical.injured') : t('medical.recovering');
        const note = playerNoteMap[p.id];
        return '<div class="med-injury-card med-injury-unlogged" data-player-id="' + p.id + '">' +
          '<div class="med-inj-card-top">' +
            '<div class="med-inj-player">' +
              '<span class="conv-pos-circles">' + posHtml + '</span>' +
              '<span class="med-card-name">' + sanitize(p.name) + teamCircle + '</span>' +
            '</div>' +
            '<span class="med-severity-badge" style="background:' + badgeColor + (st === 'doubt' ? ';color:#333' : '') + ';">' + badgeText + '</span>' +
          '</div>' +
          '<div class="med-inj-body">' +
            '<div class="med-inj-zone">' + t('medical.self_reported') + '</div>' +
            (note ? '<div class="med-inj-desc">' + sanitize(note) + '</div>' : '') +
          '</div>' +
          '<div class="med-inj-footer">' +
            '<div class="med-inj-duration"><span class="medical-since">' + t('medical.not_logged') + '</span></div>' +
            '<div class="med-inj-actions">' +
              '<button class="btn btn-small med-btn-log-for" data-player-id="' + p.id + '">' + t('medical.log_injury').replace(/^\+\s*/, '') + '</button>' +
              '<button class="btn btn-small btn-ghost med-btn-dismiss" data-player-id="' + p.id + '" title="' + t('medical.discard') + '">✕</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    // Past injuries
    const pastSorted = resolvedInj.sort((a, b) => (b.endDate || b.startDate).localeCompare(a.endDate || a.startDate));
    let pastHtml = '';
    if (!pastSorted.length) {
      pastHtml = '<div class="empty-state" style="padding:1rem;"><div class="empty-icon">✅</div><p>' + t('medical.no_past') + '</p></div>';
    } else {
      pastHtml = pastSorted.map(inj => {
        const p = players.find(x => x.id === inj.playerId);
        if (!p) return '';
        const posHtml = posCirclesHtmlGlobal(p);
        const teamCircle = p.team ? '<span class="conv-team-circle">' + sanitize(p.team) + '</span>' : '';
        const startStr = tDateDayMonth(inj.startDate);
        const endStr = inj.endDate ? tDateDayMonth(inj.endDate) : '?';
        const s = new Date(inj.startDate + 'T12:00:00');
        const e = new Date((inj.endDate || todayStr) + 'T12:00:00');
        const days = Math.max(1, Math.floor((e - s) / 86400000) + 1);
        const durationStr = days === 1 ? '1 day' : days + ' days';
        const sevColors = { minor: '#43a047', moderate: '#f9a825', severe: '#e53935' };
        return '<div class="medical-row med-past-row" data-player-id="' + p.id + '">' +
          '<div class="medical-player">' +
            '<span class="conv-pos-circles">' + posHtml + '</span>' +
            '<span class="medical-name">' + sanitize(p.name) + teamCircle + '</span>' +
          '</div>' +
          '<div class="medical-injury"><span class="med-severity-dot" style="background:' + (sevColors[inj.severity] || '#999') + ';"></span>' + sanitize(inj.muscleGroup || 'Injury') + '</div>' +
          '<div class="medical-duration">' +
            '<span class="medical-since">' + startStr + ' – ' + endStr + '</span>' +
            '<span class="medical-days">' + durationStr + '</span>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    // Analytics
    const analyticsHtml = renderInjuryAnalytics(seasonInjuries, players, todayStr);

    const fitCount = players.filter(p => playerStatusMap[p.id] === 'fit').length;
    const injCount = players.filter(p => playerStatusMap[p.id] === 'injured').length;
    const recCount = players.filter(p => playerStatusMap[p.id] === 'doubt').length;

    // Team-letter filter, same single-select idiom and styles as the roster
    // page. Scopes the whole page (counters, grid, injuries, analytics), not
    // just the grid, so it sits above the status filter row. Hidden when the
    // category has only one team, exactly like the training-detail variant.
    const _medLetters = getTeamLetters(curCat);
    const medTeamBar = _medLetters.length <= 1 ? '' :
      '<div class="roster-team-filter" style="margin-bottom:.6rem;">' +
        '<button class="roster-team-btn' + (medicalTeamFilter === 'all' ? ' roster-team-btn-active' : '') +
          '" data-med-team="all">' + t('common.all') + '</button>' +
        _medLetters.map(function (l) {
          return '<button class="roster-team-btn' + (medicalTeamFilter === l ? ' roster-team-btn-active' : '') +
            '" data-med-team="' + l + '">' + l + '</button>';
        }).join('') +
      '</div>';

    return '<div class="med-header"><h2 class="page-title">' + t('page.medical') + '</h2>' +
      '<button class="btn btn-orange med-log-btn" id="med-log-injury">' + t('medical.log_injury') + '</button></div>' +
      '<div class="medical-stats-row">' +
        '<div class="card medical-stat-card med-stat-red"><div class="medical-stat-value">' + injCount + '</div><div class="medical-stat-label">' + t('medical.injured') + '</div></div>' +
        '<div class="card medical-stat-card med-stat-amber"><div class="medical-stat-value">' + recCount + '</div><div class="medical-stat-label">' + t('medical.recovering') + '</div></div>' +
        '<div class="card medical-stat-card"><div class="medical-stat-value">' + seasonInjuries.length + '</div><div class="medical-stat-label">' + t('medical.total_season') + '</div></div>' +
        '<div class="card medical-stat-card"><div class="medical-stat-value">' + avgRecovery + '<span style="font-size:.9rem;font-weight:400;">d</span></div><div class="medical-stat-label">' + t('medical.avg_recovery') + '</div></div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-title" style="margin-bottom:.8rem;">' + t('medical.squad_fitness') + '</div>' +
        medTeamBar +
        '<div class="med-filter-row">' +
          '<button class="med-filter-btn' + (filter === 'all' ? ' med-filter-active' : '') + '" data-med-filter="all">' + t('medical.filter_all') + ' (' + players.length + ')</button>' +
          '<button class="med-filter-btn' + (filter === 'injured' ? ' med-filter-active' : '') + '" data-med-filter="injured">' + t('medical.filter_injured') + ' (' + injCount + ')</button>' +
          '<button class="med-filter-btn' + (filter === 'recovering' ? ' med-filter-active' : '') + '" data-med-filter="recovering">' + t('medical.filter_recovering') + ' (' + recCount + ')</button>' +
          '<button class="med-filter-btn' + (filter === 'fit' ? ' med-filter-active' : '') + '" data-med-filter="fit">' + t('medical.filter_fit') + ' (' + fitCount + ')</button>' +
        '</div>' +
        '<div class="med-player-grid">' + gridHtml + '</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="card-title" style="margin-bottom:.8rem;">' + t('medical.active') + '</div>' +
        activeHtml +
      '</div>' +
      '<div class="card med-past-card">' +
        '<div class="card-title med-past-title" id="med-past-toggle" style="cursor:pointer;margin-bottom:0;">' +
          t('medical.past') + ' (' + resolvedInj.length + ') <span class="med-past-arrow">' + (medicalPastExpanded ? '▲' : '▼') + '</span>' +
        '</div>' +
        '<div class="med-past-body" style="' + (medicalPastExpanded ? '' : 'display:none;') + '">' + pastHtml + '</div>' +
      '</div>' +
      analyticsHtml;
  }

  // ---------- Injury Analytics ----------
  function renderInjuryAnalytics(injuries, players, todayStr) {
    if (!injuries.length) return '';
    const now = new Date();

    // Body zone frequency
    const zoneCounts = {};
    injuries.forEach(inj => {
      const z = inj.bodyZone;
      if (z != null) zoneCounts[z] = (zoneCounts[z] || 0) + 1;
    });
    const maxZoneCount = Math.max(1, ...Object.values(zoneCounts));

    // Build mini body map heatmap SVG
    let heatPolys = '';
    BODY_ZONES.forEach((z, i) => {
      const count = zoneCounts[i] || 0;
      if (!count) {
        heatPolys += '<polygon points="' + z.pts + '" fill="transparent" stroke="transparent"/>';
      } else {
        const intensity = Math.min(1, count / maxZoneCount);
        const r = Math.round(239 * intensity + 67 * (1 - intensity));
        const g = Math.round(83 * intensity + 160 * (1 - intensity));
        const b = Math.round(80 * intensity + 80 * (1 - intensity));
        heatPolys += '<polygon points="' + z.pts + '" fill="rgba(' + r + ',' + g + ',' + b + ',' + (0.15 + 0.45 * intensity) + ')" stroke="rgba(' + r + ',' + g + ',' + b + ',.7)" stroke-width=".4">' +
          '<title>' + sanitize(z.label) + ': ' + count + ' injuries</title></polygon>';
      }
    });

    const heatMapHtml = '<div class="med-analytics-heatmap">' +
      '<div style="position:relative;display:inline-block;line-height:0;width:100%;max-width:320px;">' +
        '<img src="img/cuerpos.png" style="display:block;width:100%;border-radius:8px;pointer-events:none;">' +
        '<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;top:0;left:0;width:100%;height:100%;">' +
        heatPolys + '</svg>' +
      '</div>' +
    '</div>';

    // Monthly bar chart (SVG) — match body image height (220px)
    const monthCounts = new Array(12).fill(0);
    injuries.forEach(inj => {
      const m = parseInt(inj.startDate.slice(5, 7), 10) - 1;
      monthCounts[m]++;
    });
    const maxMonth = Math.max(1, ...monthCounts);
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const barW = 44, gap = 12, chartH = 380, padTop = 32, padBot = 34, padLeft = 38;
    const svgW = padLeft + 12 * (barW + gap) + gap;
    const barArea = chartH - padTop - padBot;
    // Y-axis ticks
    const yTicks = [];
    if (maxMonth <= 5) {
      for (let t = 0; t <= maxMonth; t++) yTicks.push(t);
    } else {
      const step = Math.ceil(maxMonth / 4);
      for (let t = 0; t <= maxMonth; t += step) yTicks.push(t);
      if (yTicks[yTicks.length - 1] < maxMonth) yTicks.push(maxMonth);
    }
    let axisHtml = '';
    yTicks.forEach(t => {
      const y = chartH - padBot - (t / maxMonth) * barArea;
      axisHtml += '<line x1="' + padLeft + '" y1="' + y + '" x2="' + (svgW - gap) + '" y2="' + y + '" stroke="var(--border)" stroke-width=".5" stroke-dasharray="3,3"/>';
      axisHtml += '<text x="' + (padLeft - 8) + '" y="' + (y + 4) + '" text-anchor="end" font-size="13" fill="var(--text-secondary)">' + t + '</text>';
    });
    let barsHtml = axisHtml;
    monthCounts.forEach((c, i) => {
      const x = padLeft + gap + i * (barW + gap);
      const h = c > 0 ? Math.max(4, (c / maxMonth) * barArea) : 0;
      const y = chartH - padBot - h;
      const color = c === 0 ? 'transparent' : (c >= maxMonth * 0.7 ? '#e53935' : c >= maxMonth * 0.4 ? '#f9a825' : '#43a047');
      barsHtml += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + h + '" rx="4" fill="' + color + '"/>';
      if (c > 0) barsHtml += '<text x="' + (x + barW / 2) + '" y="' + (y - 6) + '" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text)">' + c + '</text>';
      barsHtml += '<text x="' + (x + barW / 2) + '" y="' + (chartH - 8) + '" text-anchor="middle" font-size="15" font-weight="700" fill="var(--text-secondary)">' + monthNames[i] + '</text>';
    });
    const monthChartHtml = '<svg viewBox="0 0 ' + svgW + ' ' + chartH + '" preserveAspectRatio="xMidYMid meet" style="width:100%;">' + barsHtml + '</svg>';

    // Injury-prone table
    const playerInjCount = {};
    const playerDaysOut = {};
    const playerTopZone = {};
    injuries.forEach(inj => {
      const pid = inj.playerId;
      playerInjCount[pid] = (playerInjCount[pid] || 0) + 1;
      const s = new Date(inj.startDate + 'T12:00:00');
      const e = new Date((inj.endDate || todayStr) + 'T12:00:00');
      playerDaysOut[pid] = (playerDaysOut[pid] || 0) + Math.max(1, Math.floor((e - s) / 86400000) + 1);
      const zone = inj.muscleGroup || 'Unknown';
      if (!playerTopZone[pid]) playerTopZone[pid] = {};
      playerTopZone[pid][zone] = (playerTopZone[pid][zone] || 0) + 1;
    });
    const proneList = Object.entries(playerInjCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pid, count]) => {
        const p = players.find(x => x.id === pid);
        const name = p ? sanitize(p.name) : 'Unknown';
        const days = playerDaysOut[pid] || 0;
        const zones = playerTopZone[pid] || {};
        const topZone = Object.entries(zones).sort((a, b) => b[1] - a[1])[0];
        return '<tr><td>' + name + '</td><td>' + count + '</td><td>' + days + 'd</td><td>' + (topZone ? sanitize(topZone[0]) : '—') + '</td></tr>';
      }).join('');

    // Most common zone & severity
    const zoneFreq = {};
    const sevFreq = { minor: 0, moderate: 0, severe: 0 };
    injuries.forEach(inj => {
      const z = inj.muscleGroup || 'Unknown';
      zoneFreq[z] = (zoneFreq[z] || 0) + 1;
      if (inj.severity) sevFreq[inj.severity]++;
    });
    const topZoneEntry = Object.entries(zoneFreq).sort((a, b) => b[1] - a[1])[0];
    const topSev = Object.entries(sevFreq).sort((a, b) => b[1] - a[1])[0];

    return '<div class="card"><div class="card-title" style="margin-bottom:.8rem;">📊 Injury Analytics</div>' +
      '<div class="med-analytics-grid">' +
        '<div class="med-analytics-section">' +
          '<div class="med-analytics-subtitle">Body Zone Heatmap</div>' +
          heatMapHtml +
        '</div>' +
        '<div class="med-analytics-section">' +
          '<div class="med-analytics-subtitle">Injuries by Month</div>' +
          monthChartHtml +
        '</div>' +
      '</div>' +
      (proneList ? '<div class="med-analytics-section" style="margin-top:1rem;">' +
        '<div class="med-analytics-subtitle">Injury-Prone Players</div>' +
        '<table class="med-prone-table"><thead><tr><th>Player</th><th>Injuries</th><th>Days Out</th><th>Most Affected</th></tr></thead><tbody>' + proneList + '</tbody></table>' +
      '</div>' : '') +
      '<div class="med-season-summary">' +
        '<div class="med-summary-item"><span class="med-summary-label">Most Common Area</span><span class="med-summary-val">' + (topZoneEntry ? sanitize(topZoneEntry[0]) + ' (' + topZoneEntry[1] + ')' : '—') + '</span></div>' +
        '<div class="med-summary-item"><span class="med-summary-label">Most Common Severity</span><span class="med-summary-val">' + (topSev ? topSev[0].charAt(0).toUpperCase() + topSev[0].slice(1) + ' (' + topSev[1] + ')' : '—') + '</span></div>' +
      '</div>' +
    '</div>';
  }

  // ---------- Medical Detail ----------
  function renderMedicalDetail() {
    const users = getUsers();
    const p = users.find(x => String(x.id) === String(medicalDetailPlayerId));
    if (!p) return '<div class="empty-state"><p>' + t('common.player_not_found') + '</p></div>';
    // Reached by drill-down, but a stale id must not expose another
    // category's medical record.
    const visible = getVisibleCategories();
    if (p.category && visible.length && visible.indexOf(p.category) === -1) {
      return '<div class="empty-state"><div class="empty-icon">🔒</div><p>' +
        t('error.no_categories') + '</p></div>';
    }
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const derived = deriveFitnessStatus(p.id, false);
    const posHtml = posCirclesHtmlGlobal(p);
    const teamCircle = p.team ? '<span class="conv-team-circle">' + sanitize(p.team) + '</span>' : '';
    const allInj = getPlayerInjuries(p.id).sort((a, b) => b.startDate.localeCompare(a.startDate));
    const activeInj = allInj.find(i => i.status === 'active');
    const recoveringInj = allInj.find(i => i.status === 'recovering');
    const currentInj = activeInj || recoveringInj;

    // Status badge
    let statusHtml = '';
    if (derived.fitnessStatus === 'injured') statusHtml = '<span class="med-detail-status" style="background:#e53935;">' + t('medical.status_injured') + '</span>';
    else if (derived.fitnessStatus === 'doubt') statusHtml = '<span class="med-detail-status" style="background:#f9a825;color:#333;">' + t('medical.status_recovering') + '</span>';
    else statusHtml = '<span class="med-detail-status" style="background:#43a047;">' + t('medical.status_fit') + '</span>';

    // Current injury card
    let currentInjHtml = '';
    if (currentInj) {
      const days = Math.max(0, Math.floor((now - new Date(currentInj.startDate + 'T12:00:00')) / 86400000));
      const sinceStr = tDateDMY(currentInj.startDate);
      const sevColors = { minor: '#43a047', moderate: '#f9a825', severe: '#e53935' };
      const sevColor = sevColors[currentInj.severity] || '#999';
      let returnHtml = '';
      if (currentInj.expectedReturn) {
        const retD = new Date(currentInj.expectedReturn + 'T12:00:00');
        const retDays = Math.max(0, Math.ceil((retD - now) / 86400000));
        returnHtml = '<div class="med-detail-return">' + t('med_detail.expected') + ' ' + tDateDayMonth(currentInj.expectedReturn) + (retDays > 0 ? ' (~' + retDays + ' days)' : ' (due)') + '</div>';
      }
      currentInjHtml = '<div class="card med-current-card">' +
        '<div class="card-title" style="margin-bottom:.6rem;">' + t('med_detail.current') + '</div>' +
        '<div class="med-detail-inj-info">' +
          '<span class="med-severity-badge" style="background:' + sevColor + ';">' + (currentInj.severity || 'Unknown').charAt(0).toUpperCase() + (currentInj.severity || 'unknown').slice(1) + '</span>' +
          '<span class="med-detail-zone">' + sanitize(currentInj.muscleGroup || 'Unknown') + (currentInj.muscleSub ? ' (' + sanitize(currentInj.muscleSub) + ')' : '') + '</span>' +
        '</div>' +
        (currentInj.description ? '<div class="med-detail-desc">' + sanitize(currentInj.description) + '</div>' : '') +
        '<div class="med-detail-timing">Since ' + sinceStr + ' · ' + (days === 0 ? 'Today' : days + ' days') + '</div>' +
        returnHtml +
        (currentInj.notes ? '<div class="med-detail-notes">' + sanitize(currentInj.notes) + '</div>' : '') +
        '<div class="med-inj-actions" style="margin-top:.6rem;">' +
          (currentInj.status === 'active' ? '<button class="btn btn-small med-btn-recover" data-inj-id="' + currentInj.id + '">' + t('medical.mark_recovering') + '</button>' : '') +
          '<button class="btn btn-small med-btn-resolve" data-inj-id="' + currentInj.id + '">' + t('medical.mark_resolved') + '</button>' +
          '<button class="btn btn-small btn-ghost med-btn-edit" data-inj-id="' + currentInj.id + '">' + t('common.edit') + '</button>' +
        '</div>' +
      '</div>';
    }

    // Body map with history heat
    const zoneCounts = {};
    allInj.forEach(inj => { if (inj.bodyZone != null) zoneCounts[inj.bodyZone] = (zoneCounts[inj.bodyZone] || 0) + 1; });
    const maxZ = Math.max(1, ...Object.values(zoneCounts));
    let bodyPolys = '';
    BODY_ZONES.forEach((z, i) => {
      const count = zoneCounts[i] || 0;
      const isCurrent = currentInj && currentInj.bodyZone === i;
      if (!count && !isCurrent) {
        bodyPolys += '<polygon points="' + z.pts + '" fill="transparent" stroke="transparent"/>';
      } else {
        const intensity = Math.min(1, count / maxZ);
        bodyPolys += '<polygon points="' + z.pts + '" fill="rgba(239,83,80,' + (0.1 + 0.4 * intensity) + ')" stroke="rgba(239,83,80,.7)" stroke-width=".4">' +
          '<title>' + sanitize(z.label) + ': ' + count + ' injuries</title></polygon>';
        if (isCurrent) {
          const pairs = z.pts.split(/\s+/).map(pp => pp.split(',').map(Number));
          let cx = 0, cy = 0;
          pairs.forEach(([x, y]) => { cx += x; cy += y; });
          cx = (cx / pairs.length).toFixed(1);
          cy = (cy / pairs.length).toFixed(1);
          bodyPolys += '<circle cx="' + cx + '" cy="' + cy + '" r="1.8" class="mystats-injury-dot"/>';
        }
      }
    });

    const bodyMapHtml = '<div class="med-detail-body-map">' +
      '<div style="position:relative;display:inline-block;line-height:0;">' +
        '<img src="img/cuerpos.png" style="display:block;height:260px;border-radius:8px;pointer-events:none;">' +
        '<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;top:0;left:0;width:100%;height:100%;">' +
        bodyPolys + '</svg>' +
      '</div>' +
    '</div>';

    // Recurring injury alerts
    let recurringHtml = '';
    const zoneInjCounts = {};
    allInj.forEach(inj => {
      const zone = inj.muscleGroup || 'Unknown';
      zoneInjCounts[zone] = (zoneInjCounts[zone] || 0) + 1;
    });
    const recurring = Object.entries(zoneInjCounts).filter(([, c]) => c >= 2);
    if (recurring.length) {
      recurringHtml = '<div class="med-recurring-alert">' +
        recurring.map(([zone, c]) => t('med_detail.recurring') + ' ' + sanitize(zone) + ' (' + c + ' ' + t('med_detail.injuries_count') + ')').join('<br>') +
      '</div>';
    }

    // Full timeline
    let timelineHtml = '';
    if (!allInj.length) {
      timelineHtml = '<div class="empty-state" style="padding:1rem;"><p>' + t('med_detail.no_history') + '</p></div>';
    } else {
      timelineHtml = allInj.map(inj => {
        const sevColors = { minor: '#43a047', moderate: '#f9a825', severe: '#e53935' };
        const statusColors = { active: '#e53935', recovering: '#f9a825', resolved: '#43a047' };
        const startStr = tDateDayMonth(inj.startDate);
        const endStr = inj.endDate ? tDateDayMonth(inj.endDate) : t('stats.present');
        const s = new Date(inj.startDate + 'T12:00:00');
        const e = inj.endDate ? new Date(inj.endDate + 'T12:00:00') : now;
        const days = Math.max(1, Math.floor((e - s) / 86400000) + 1);
        return '<div class="med-timeline-row">' +
          '<span class="med-severity-dot" style="background:' + (statusColors[inj.status] || '#999') + ';"></span>' +
          '<div class="med-timeline-info">' +
            '<span class="med-timeline-zone">' + sanitize(inj.muscleGroup || 'Injury') + (inj.muscleSub ? ' (' + sanitize(inj.muscleSub) + ')' : '') + '</span>' +
            '<span class="med-severity-badge med-severity-sm" style="background:' + (sevColors[inj.severity] || '#999') + ';">' + (inj.severity || 'unknown') + '</span>' +
          '</div>' +
          '<div class="med-timeline-dates">' + startStr + ' – ' + endStr + ' · ' + days + 'd</div>' +
        '</div>';
      }).join('');
    }

    return '<div class="med-detail-back" id="med-back">' + t('med_detail.back') + '</div>' +
      '<div class="med-detail-header">' +
        '<div class="med-detail-player">' +
          '<span class="conv-pos-circles">' + posHtml + '</span>' +
          '<span class="med-detail-name">' + sanitize(p.name) + teamCircle + '</span>' +
          statusHtml +
        '</div>' +
      '</div>' +
      currentInjHtml +
      recurringHtml +
      '<div class="med-detail-columns">' +
        '<div class="card med-detail-map-card">' +
          '<div class="card-title" style="margin-bottom:.6rem;">' + t('med_detail.injury_map') + '</div>' +
          bodyMapHtml +
        '</div>' +
        '<div class="card med-detail-timeline-card">' +
          '<div class="card-title" style="margin-bottom:.6rem;">' + t('med_detail.timeline') + ' (' + allInj.length + ')</div>' +
          timelineHtml +
        '</div>' +
      '</div>';
  }

  // ---------- Staff Injury Logger ----------
  function showStaffInjuryLogger(preselectedPlayerId) {
    const users = getUsers();
    // Scope to the same squad the medical page is showing. This dropdown used
    // to list every player in the club regardless of category or team, which
    // let a coach log an injury against someone they cannot otherwise see.
    const _logCat = getCurrentCategory();
    const players = users.filter(u => (u.roles || []).includes('player')
      && (!_logCat || (u.category || '') === _logCat)
      && (medicalTeamFilter === 'all' || (u.team || '') === medicalTeamFilter))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

    const overlay = document.createElement('div');
    overlay.className = 'body-map-overlay';
    const modal = document.createElement('div');
    modal.className = 'body-map-modal med-logger-modal';
    modal.innerHTML = '<div class="body-map-header"><span>🏥 Log Injury</span><button class="body-map-close">&times;</button></div>';

    // Scrollable content
    const content = document.createElement('div');
    content.className = 'med-logger-content';

    // Player selector
    const playerSection = document.createElement('div');
    playerSection.className = 'med-logger-field';
    playerSection.innerHTML = '<label>Player</label><select class="med-logger-select" id="med-log-player">' +
      '<option value="">Select player…</option>' +
      players.map(p => '<option value="' + p.id + '"' + (p.id === preselectedPlayerId ? ' selected' : '') + '>' + sanitize(p.name) + '</option>').join('') +
    '</select>';
    content.appendChild(playerSection);

    // Body map
    const mapSection = document.createElement('div');
    mapSection.className = 'med-logger-field';
    mapSection.innerHTML = '<label>Injured Area (tap body map)</label>';
    const imgWrap = document.createElement('div');
    imgWrap.className = 'body-map-img-wrap';
    imgWrap.style.cssText = 'cursor:pointer;';
    const img = document.createElement('img');
    img.src = 'img/cuerpos.png'; img.className = 'body-map-img'; img.draggable = false;
    img.style.height = '50vh';
    imgWrap.appendChild(img);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.classList.add('body-map-svg');
    const tip = document.createElement('div');
    tip.className = 'body-zone-tip';
    BODY_ZONES.forEach((z, i) => {
      const poly = document.createElementNS(svgNS, 'polygon');
      poly.setAttribute('points', z.pts);
      poly.dataset.idx = i;
      poly.classList.add('body-zone-poly');
      poly.addEventListener('mouseenter', () => { tip.textContent = z.label; tip.style.display = 'block'; });
      poly.addEventListener('mousemove', e => {
        const r = imgWrap.getBoundingClientRect();
        tip.style.left = (e.clientX - r.left + 12) + 'px';
        tip.style.top = (e.clientY - r.top - 28) + 'px';
      });
      poly.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
      svg.appendChild(poly);
    });
    imgWrap.appendChild(svg);
    imgWrap.appendChild(tip);
    mapSection.appendChild(imgWrap);
    content.appendChild(mapSection);

    // Choice panel (appears after zone click)
    const choicePanel = document.createElement('div');
    choicePanel.className = 'med-logger-field med-logger-choice';
    choicePanel.style.display = 'none';
    content.appendChild(choicePanel);

    // Severity
    const sevSection = document.createElement('div');
    sevSection.className = 'med-logger-field';
    sevSection.innerHTML = '<label>Severity</label>' +
      '<div class="tg-btn-group med-sev-group">' +
        '<button class="tg-btn" data-sev="minor">Minor</button>' +
        '<button class="tg-btn tg-btn-active" data-sev="moderate">Moderate</button>' +
        '<button class="tg-btn" data-sev="severe">Severe</button>' +
      '</div>';
    content.appendChild(sevSection);

    // Dates
    const dateSection = document.createElement('div');
    dateSection.className = 'med-logger-field med-logger-dates';
    const todayDMY = todayStr.split('-').reverse().join('/');
    dateSection.innerHTML = '<div><label>Start Date</label><input type="text" class="med-logger-input md-datepicker" data-display-dmy data-allow-past id="med-log-start" data-date-iso="' + todayStr + '" value="' + todayDMY + '" placeholder="dd/mm/yyyy" readonly></div>' +
      '<div><label>Expected Return</label><input type="text" class="med-logger-input md-datepicker" data-display-dmy data-allow-past id="med-log-return" data-date-iso="" value="" placeholder="dd/mm/yyyy" readonly></div>';
    content.appendChild(dateSection);

    // Notes
    const notesSection = document.createElement('div');
    notesSection.className = 'med-logger-field';
    notesSection.innerHTML = '<label>Notes</label><textarea class="med-logger-textarea" id="med-log-notes" rows="2" placeholder="Additional notes…" maxlength="300"></textarea>';
    content.appendChild(notesSection);

    // Save button
    const saveSection = document.createElement('div');
    saveSection.className = 'med-logger-field';
    saveSection.innerHTML = '<button class="btn btn-orange med-logger-save" id="med-log-save">Save Injury</button>';
    content.appendChild(saveSection);

    modal.appendChild(content);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close
    function closeOverlay() { overlay.remove(); closeDatePicker(); }
    modal.querySelector('.body-map-close').addEventListener('click', closeOverlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeOverlay(); });
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { closeOverlay(); document.removeEventListener('keydown', onEsc); }
    });

    // Bind custom datepicker
    modal.querySelectorAll('.md-datepicker').forEach(inp => {
      inp.addEventListener('click', () => openDatePicker(inp));
    });

    // Zone interaction
    let activePoly = null;
    let selectedGroup = '', selectedSub = '';
    svg.querySelectorAll('.body-zone-poly').forEach(poly => {
      poly.addEventListener('click', () => {
        if (activePoly === poly) {
          poly.classList.remove('body-zone-active');
          activePoly = null;
          choicePanel.style.display = 'none';
          choicePanel.innerHTML = '';
          return;
        }
        if (activePoly) activePoly.classList.remove('body-zone-active');
        poly.classList.add('body-zone-active');
        activePoly = poly;
        const z = BODY_ZONES[parseInt(poly.dataset.idx)];
        buildLoggerChoice(z.groups);
      });
    });

    function buildLoggerChoice(groups) {
      choicePanel.style.display = '';
      let html = '<div class="body-map-choice-row">';
      if (groups.length > 1) {
        html += '<select class="body-map-group-sel">';
        groups.forEach(g => { html += '<option value="' + sanitize(g) + '">' + sanitize(g) + '</option>'; });
        html += '</select>';
      } else {
        html += '<span class="body-map-group-label">' + sanitize(groups[0]) + '</span>';
      }
      html += '<select class="body-map-sub-sel"><option value="">— General —</option>';
      (GROUP_SUBS[groups[0]] || []).forEach(s => { html += '<option value="' + sanitize(s) + '">' + sanitize(s) + '</option>'; });
      html += '</select>';
      html += '<input type="text" class="body-map-desc" placeholder="Describe injury…" maxlength="120">';
      html += '</div>';
      choicePanel.innerHTML = html;
      selectedGroup = groups[0];
      selectedSub = '';
      const groupSel = choicePanel.querySelector('.body-map-group-sel');
      const subSel = choicePanel.querySelector('.body-map-sub-sel');
      if (groupSel) {
        groupSel.addEventListener('change', () => {
          selectedGroup = groupSel.value;
          let opts = '<option value="">— General —</option>';
          (GROUP_SUBS[selectedGroup] || []).forEach(s => { opts += '<option value="' + sanitize(s) + '">' + sanitize(s) + '</option>'; });
          subSel.innerHTML = opts;
        });
      }
      if (subSel) subSel.addEventListener('change', () => { selectedSub = subSel.value; });
    }

    // Severity buttons
    let selectedSeverity = 'moderate';
    sevSection.querySelectorAll('.tg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        sevSection.querySelectorAll('.tg-btn').forEach(b => b.classList.remove('tg-btn-active'));
        btn.classList.add('tg-btn-active');
        selectedSeverity = btn.dataset.sev;
      });
    });

    // Save
    document.getElementById('med-log-save').addEventListener('click', () => {
      const playerId = document.getElementById('med-log-player').value;
      if (!playerId) { alert(t('alert.select_player')); return; }
      const startDate = document.getElementById('med-log-start').dataset.dateIso || todayStr;
      const expectedReturn = document.getElementById('med-log-return').dataset.dateIso || null;
      const notes = document.getElementById('med-log-notes').value.trim();
      const zoneIdx = activePoly ? parseInt(activePoly.dataset.idx) : null;
      const zLabel = zoneIdx != null && BODY_ZONES[zoneIdx] ? BODY_ZONES[zoneIdx].label : '';
      const descEl = choicePanel.querySelector('.body-map-desc');
      const desc = descEl ? descEl.value.trim() : '';
      const groupLabelEl = choicePanel.querySelector('.body-map-group-label');
      const groupSelEl = choicePanel.querySelector('.body-map-group-sel');
      const subSelEl = choicePanel.querySelector('.body-map-sub-sel');
      const mGroup = groupSelEl ? groupSelEl.value : (groupLabelEl ? groupLabelEl.textContent : zLabel || 'Injury');
      const mSub = subSelEl ? subSelEl.value : '';

      // Check if player already has an active injury
      const injuries = getInjuries();
      const existing = injuries.find(inj => inj.playerId === playerId && inj.status === 'active');
      if (existing) {
        if (!confirm(t('confirm.existing_injury'))) return;
      }

      const inj = addInjury({
        playerId, bodyZone: zoneIdx, bodyZoneLabel: zLabel,
        muscleGroup: mGroup || 'Injury', muscleSub: mSub,
        description: desc, severity: selectedSeverity,
        status: 'active', startDate,
        expectedReturn, endDate: null,
        createdBy: getSession().id, notes
      });

      // Update user fitness status
      const usrs = getUsers();
      const u = usrs.find(x => x.id === playerId);
      if (u) { u.fitnessStatus = 'injured'; u.injuryNote = mGroup + (mSub ? ' (' + mSub + ')' : '') + (desc ? ' – ' + desc : ''); saveUsers(usrs); }
      // Also update fa_injury_notes & zone for backwards compat
      const injNotes = JSON.parse(localStorage.getItem('fa_injury_notes') || '{}');
      injNotes[playerId] = mGroup + (mSub ? ' (' + mSub + ')' : '') + (desc ? ' – ' + desc : '');
      localStorage.setItem('fa_injury_notes', JSON.stringify(injNotes));
      if (zoneIdx != null) {
        const zm = JSON.parse(localStorage.getItem('fa_injury_zone') || '{}');
        zm[playerId] = zoneIdx;
        localStorage.setItem('fa_injury_zone', JSON.stringify(zm));
      }

      addStaffNotification({
        type: 'training_avail',
        uid: u ? u.id : '',
        playerName: u ? u.name : '?',
        detail: 'Injured – ' + (mGroup || 'Injury'),
        activity: 'Staff logged injury'
      });

      closeOverlay();
      renderPage(getSession());
    });
  }

  // ---------- Edit Injury Modal ----------
  function showEditInjuryModal(injuryId) {
    const injuries = getInjuries();
    const inj = injuries.find(i => i.id === injuryId);
    if (!inj) return;
    const users = getUsers();
    const player = users.find(u => u.id === inj.playerId);

    const overlay = document.createElement('div');
    overlay.className = 'body-map-overlay';
    const modal = document.createElement('div');
    modal.className = 'body-map-modal med-edit-modal';
    modal.innerHTML = '<div class="body-map-header"><span>✏️ Edit Injury' + (player ? ' — ' + sanitize(player.name) : '') + '</span><button class="body-map-close">&times;</button></div>';

    const content = document.createElement('div');
    content.className = 'med-logger-content';

    // Severity
    content.innerHTML = '<div class="med-logger-field"><label>Severity</label>' +
      '<div class="tg-btn-group med-sev-group">' +
        '<button class="tg-btn' + (inj.severity === 'minor' ? ' tg-btn-active' : '') + '" data-sev="minor">Minor</button>' +
        '<button class="tg-btn' + (inj.severity === 'moderate' ? ' tg-btn-active' : '') + '" data-sev="moderate">Moderate</button>' +
        '<button class="tg-btn' + (inj.severity === 'severe' ? ' tg-btn-active' : '') + '" data-sev="severe">Severe</button>' +
      '</div></div>' +
      '<div class="med-logger-field"><label>Status</label>' +
      '<div class="tg-btn-group">' +
        '<button class="tg-btn' + (inj.status === 'active' ? ' tg-btn-active' : '') + '" data-status="active">Active</button>' +
        '<button class="tg-btn' + (inj.status === 'recovering' ? ' tg-btn-active' : '') + '" data-status="recovering">Recovering</button>' +
        '<button class="tg-btn' + (inj.status === 'resolved' ? ' tg-btn-active' : '') + '" data-status="resolved">Resolved</button>' +
      '</div></div>' +
      '<div class="med-logger-field med-logger-dates">' +
        '<div><label>Start Date</label><input type="text" class="med-logger-input md-datepicker" data-display-dmy data-allow-past id="med-edit-start" data-date-iso="' + sanitize(inj.startDate || '') + '" value="' + (inj.startDate ? inj.startDate.split('-').reverse().join('/') : '') + '" placeholder="dd/mm/yyyy" readonly></div>' +
        '<div><label>Expected Return</label><input type="text" class="med-logger-input md-datepicker" data-display-dmy data-allow-past id="med-edit-return" data-date-iso="' + sanitize(inj.expectedReturn || '') + '" value="' + (inj.expectedReturn ? inj.expectedReturn.split('-').reverse().join('/') : '') + '" placeholder="dd/mm/yyyy" readonly></div>' +
        '<div><label>End Date</label><input type="text" class="med-logger-input md-datepicker" data-display-dmy data-allow-past id="med-edit-end" data-date-iso="' + sanitize(inj.endDate || '') + '" value="' + (inj.endDate ? inj.endDate.split('-').reverse().join('/') : '') + '" placeholder="dd/mm/yyyy" readonly></div>' +
      '</div>' +
      '<div class="med-logger-field"><label>Notes</label><textarea class="med-logger-textarea" id="med-edit-notes" rows="2" maxlength="300">' + sanitize(inj.notes || '') + '</textarea></div>' +
      '<div class="med-logger-field"><button class="btn btn-orange med-logger-save" id="med-edit-save">Save Changes</button></div>';

    modal.appendChild(content);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function closeOverlay() { overlay.remove(); closeDatePicker(); }
    modal.querySelector('.body-map-close').addEventListener('click', closeOverlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeOverlay(); });

    // Bind custom datepicker
    modal.querySelectorAll('.md-datepicker').forEach(inp => {
      inp.addEventListener('click', () => openDatePicker(inp));
    });

    let editSev = inj.severity || 'moderate';
    let editStatus = inj.status || 'active';
    content.querySelectorAll('.med-sev-group .tg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        content.querySelectorAll('.med-sev-group .tg-btn').forEach(b => b.classList.remove('tg-btn-active'));
        btn.classList.add('tg-btn-active');
        editSev = btn.dataset.sev;
      });
    });
    content.querySelectorAll('[data-status]').forEach(btn => {
      btn.addEventListener('click', () => {
        content.querySelectorAll('[data-status]').forEach(b => b.classList.remove('tg-btn-active'));
        btn.classList.add('tg-btn-active');
        editStatus = btn.dataset.status;
      });
    });

    document.getElementById('med-edit-save').addEventListener('click', () => {
      const now2 = new Date();
      const todayStr2 = now2.getFullYear() + '-' + String(now2.getMonth() + 1).padStart(2, '0') + '-' + String(now2.getDate()).padStart(2, '0');
      const changes = {
        severity: editSev,
        status: editStatus,
        startDate: document.getElementById('med-edit-start').dataset.dateIso || inj.startDate,
        expectedReturn: document.getElementById('med-edit-return').dataset.dateIso || null,
        endDate: editStatus === 'resolved' ? (document.getElementById('med-edit-end').dataset.dateIso || todayStr2) : (document.getElementById('med-edit-end').dataset.dateIso || null),
        notes: document.getElementById('med-edit-notes').value.trim()
      };
      updateInjury(injuryId, changes);
      // Update player fitness status
      if (player) deriveFitnessStatus(player.id, true);
      closeOverlay();
      renderPage(getSession());
    });
  }

  // ---------- Medical Bind ----------
  function bindMedical() {
    bindMedicalBodyPopup();

    // Log injury button
    const logBtn = document.getElementById('med-log-injury');
    if (logBtn) logBtn.addEventListener('click', () => showStaffInjuryLogger());

    // Filter buttons
    document.querySelectorAll('[data-med-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        medicalFilter = btn.dataset.medFilter;
        renderPage(getSession());
      });
    });

    // Team-letter filter
    document.querySelectorAll('[data-med-team]').forEach(btn => {
      btn.addEventListener('click', () => {
        medicalTeamFilter = btn.dataset.medTeam;
        renderPage(getSession());
      });
    });

    // "Log injury" on a self-reported player who has no record yet
    document.querySelectorAll('.med-btn-log-for').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        showStaffInjuryLogger(btn.dataset.playerId);
      });
    });

    // Discard a self-report that isn't a real injury. Records the date of the
    // player's latest answer rather than rewriting the answer itself, so his
    // attendance history is untouched and a later report re-raises the flag.
    document.querySelectorAll('.med-btn-dismiss').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const uid = btn.dataset.playerId;
        if (!confirm(t('confirm.discard_injury'))) return;
        const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
        const training = getTrainings();
        const answeredDates = training
          .filter(tr => tr.date && readRecord(availData, uid, tr, 'avail'))
          .map(tr => tr.date).sort();
        const upTo = answeredDates.length ? answeredDates[answeredDates.length - 1] : localDateStr(new Date());
        const dismissed = JSON.parse(localStorage.getItem('fa_injury_dismissed') || '{}');
        dismissed[uid] = upTo;
        localStorage.setItem('fa_injury_dismissed', JSON.stringify(dismissed));
        // Drop the free-text note too, or it lingers on other surfaces.
        const injNotes = JSON.parse(localStorage.getItem('fa_injury_notes') || '{}');
        if (injNotes[uid]) {
          delete injNotes[uid];
          localStorage.setItem('fa_injury_notes', JSON.stringify(injNotes));
        }
        deriveFitnessStatus(uid, true);
        renderPage(getSession());
      });
    });

    // Player card clicks → medical detail
    document.querySelectorAll('.med-player-card').forEach(card => {
      card.addEventListener('click', () => {
        medicalDetailPlayerId = card.dataset.playerId;
        currentPage = 'medical-detail';
        renderPage(getSession());
      });
    });

    // Injury card player clicks → medical detail
    document.querySelectorAll('.med-injury-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('button')) return; // don't navigate when clicking action buttons
        medicalDetailPlayerId = card.dataset.playerId;
        currentPage = 'medical-detail';
        renderPage(getSession());
      });
    });

    // Mark recovering
    document.querySelectorAll('.med-btn-recover').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.dataset.injId;
        updateInjury(id, { status: 'recovering' });
        const inj = getInjuries().find(i => i.id === id);
        if (inj) deriveFitnessStatus(inj.playerId, true);
        renderPage(getSession());
      });
    });

    // Mark resolved
    document.querySelectorAll('.med-btn-resolve').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        resolveInjury(btn.dataset.injId);
        const inj = getInjuries().find(i => i.id === btn.dataset.injId);
        if (inj) deriveFitnessStatus(inj.playerId, true);
        renderPage(getSession());
      });
    });

    // Edit
    document.querySelectorAll('.med-btn-edit').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        showEditInjuryModal(btn.dataset.injId);
      });
    });

    // Past injuries toggle
    const pastToggle = document.getElementById('med-past-toggle');
    if (pastToggle) {
      pastToggle.addEventListener('click', () => {
        medicalPastExpanded = !medicalPastExpanded;
        const body = pastToggle.closest('.med-past-card').querySelector('.med-past-body');
        const arrow = pastToggle.querySelector('.med-past-arrow');
        if (body) body.style.display = medicalPastExpanded ? '' : 'none';
        if (arrow) arrow.textContent = medicalPastExpanded ? '▲' : '▼';
      });
    }
  }

  // ---------- Medical Detail Bind ----------
  function bindMedicalDetail() {
    // Back button
    const backBtn = document.getElementById('med-back');
    if (backBtn) {
      // Captured at bind time, while _prevPage still holds the page that
      // opened this record — by click time another render may have moved on.
      const to = backTarget('medical');
      backBtn.addEventListener('click', () => {
        currentPage = to;
        renderPage(getSession());
      });
    }

    // Action buttons
    document.querySelectorAll('.med-btn-recover').forEach(btn => {
      btn.addEventListener('click', () => {
        updateInjury(btn.dataset.injId, { status: 'recovering' });
        const inj = getInjuries().find(i => i.id === btn.dataset.injId);
        if (inj) deriveFitnessStatus(inj.playerId, true);
        renderPage(getSession());
      });
    });
    document.querySelectorAll('.med-btn-resolve').forEach(btn => {
      btn.addEventListener('click', () => {
        resolveInjury(btn.dataset.injId);
        const inj = getInjuries().find(i => i.id === btn.dataset.injId);
        if (inj) deriveFitnessStatus(inj.playerId, true);
        renderPage(getSession());
      });
    });
    document.querySelectorAll('.med-btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        showEditInjuryModal(btn.dataset.injId);
      });
    });
  }

  // ---------- My Stats Injury Hover Popup ----------
  function bindMyStatsInjuryPopup() {
    let popup = document.getElementById('mystats-body-popup');
    if (popup) popup.remove();
    const rows = document.querySelectorAll('.mystats-inj-row');
    if (!rows.length) return;
    popup = document.createElement('div');
    popup.id = 'mystats-body-popup';
    popup.className = 'medical-body-popup';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:inline-block;line-height:0;';
    const img = document.createElement('img');
    img.src = 'img/cuerpos.png'; img.alt = 'Body map';
    img.style.cssText = 'display:block;width:300px;height:auto;border-radius:8px;';
    wrap.appendChild(img);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
    BODY_ZONES.forEach(z => {
      const poly = document.createElementNS(svgNS, 'polygon');
      poly.setAttribute('points', z.pts);
      poly.style.cssText = 'fill:transparent;stroke:transparent;transition:fill .2s,stroke .2s;';
      svg.appendChild(poly);
    });
    wrap.appendChild(svg);
    popup.appendChild(wrap);
    document.body.appendChild(popup);

    const OFFSET = 16;
    rows.forEach(row => {
      row.addEventListener('mouseenter', e => {
        const zIdxStr = row.dataset.zoneIdx;
        const zIdx = zIdxStr !== '' && zIdxStr != null ? parseInt(zIdxStr, 10) : null;
        svg.querySelectorAll('polygon').forEach((poly, i) => {
          if (zIdx != null && i === zIdx) {
            poly.style.fill = 'rgba(239,83,80,.4)';
            poly.style.stroke = '#ef5350';
            poly.style.strokeWidth = '.6';
          } else {
            poly.style.fill = 'transparent';
            poly.style.stroke = 'transparent';
          }
        });
        popup.classList.add('visible');
        positionPopup(e);
      });
      row.addEventListener('mousemove', positionPopup);
      row.addEventListener('mouseleave', () => {
        popup.classList.remove('visible');
        svg.querySelectorAll('polygon').forEach(poly => {
          poly.style.fill = 'transparent';
          poly.style.stroke = 'transparent';
        });
      });
    });
    function positionPopup(e) {
      const pw = popup.offsetWidth || 316;
      const ph = popup.offsetHeight || 420;
      // On narrow screens, center the popup
      if (window.innerWidth < 600) {
        popup.style.position = 'fixed';
        popup.style.left = Math.max(8, (window.innerWidth - pw) / 2) + 'px';
        popup.style.top = Math.max(8, (window.innerHeight - ph) / 2) + 'px';
        return;
      }
      let x = e.clientX + OFFSET;
      let y = e.clientY - ph / 2;
      if (x + pw > window.innerWidth - 8) x = e.clientX - pw - OFFSET;
      if (y < 8) y = 8;
      if (y + ph > window.innerHeight - 8) y = window.innerHeight - ph - 8;
      popup.style.left = x + 'px';
      popup.style.top = y + 'px';
    }
  }

  function renderStaffNotifications() {
    const all = getStaffNotifications();
    const notifs = all.filter(inMyNotifScope);
    // Track which are unread before marking
    const unreadIds = new Set(notifs.filter(n => !n.read).map(n => n.id));

    function fmtTs(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      const day = tDayShort(d.getDay()) + ' ' + String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0');
      const time = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
      return day + ' ' + time;
    }
    function typeBadge(type) {
      const map = {
        'training_rpe': { label: 'Training RPE', bg: '#43a047' },
        'match_rpe': { label: 'Match RPE', bg: '#f9a825', color: '#333' },
        'extra_training': { label: 'Extra Training', bg: '#78909c' },
        'training_avail': { label: 'Training Avail', bg: '#1e88e5' },
        'match_avail': { label: 'Match Avail', bg: '#e53935' }
      };
      const m = map[type] || { label: type, bg: '#999' };
      return `<span class="notif-type-badge" style="background:${m.bg};${m.color ? 'color:'+m.color : ''}">${sanitize(m.label)}</span>`;
    }

    let rows = '';
    if (!notifs.length) {
      rows = '<p style="color:var(--text-secondary);padding:1rem 0;">' + t('notif.no_notif') + '</p>';
    } else {
      notifs.forEach(n => {
        const isNew = unreadIds.has(n.id);
        rows += `<div class="notif-row${isNew ? ' notif-new' : ''}">
          <div class="notif-row-top">
            ${typeBadge(n.type)}
            <span class="notif-player">${sanitize(n.playerName || '?')}</span>
            <span class="notif-time">${fmtTs(n.timestamp)}</span>
          </div>
          <div class="notif-row-detail">${sanitize(n.activity || '')}${n.detail ? ' — ' + sanitize(n.detail) : ''}</div>
        </div>`;
      });
    }

    const html = `<h2 class="page-title">${t('page.notifications')}</h2>
      <div class="card">
        <div class="notif-header">
          <span class="card-title" style="margin-bottom:0;">${t('notif.all')}</span>
          ${notifs.length ? '<button class="btn btn-small btn-outline" id="btn-clear-notifs">Clear All</button>' : ''}
        </div>
        ${rows}
      </div>`;

    // Mark as read after building HTML — only the ones actually shown, and
    // written back over the FULL list (this blob is club-wide and saved
    // whole, so writing the filtered array would delete everyone else's).
    if (unreadIds.size) {
      all.forEach(n => { if (unreadIds.has(n.id)) n.read = true; });
      saveStaffNotifications(all);
      updateStaffNotifBadge();
    }

    return html;
  }

  // #endregion Medical

  // #region Event Bindings
  // ---------- Dynamic actions ----------
  function bindDynamicActions() {
    // Category bar clicks. Clamp to the allowed set — the bar only ever
    // renders permitted categories, but never trust the DOM for a filter
    // that now decides what a coach can see.
    $$('.cat-bar-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        // The "Totes" button carries data-cat="", which lands here as '' —
        // the deliberate "show everything" value, NOT the unset null. Do
        // not "tidy" this into a falsy check; see _viewCategory.
        var want = btn.dataset.cat || '';
        _viewCategory = (want && getVisibleCategories().indexOf(want) === -1) ? '' : want;
        // Team letters are per-category, so a letter selected under the old
        // category must not silently persist into one that may not have it.
        medicalTeamFilter = 'all';
        rosterTeamFilter = 'all';
        stdTeamFilter = null;
        trainingTeamFilter = null;
        renderPage(getSession());
      });
    });

    // Animate percentage counters (only the first time per page navigation)
    $$('.po-pct-counter').forEach(el => {
      const target = parseInt(el.dataset.target, 10) || 0;
      if (_pctAnimatedPage === currentPage) {
        el.textContent = target + '%';
        return;
      }
      const duration = 1000;
      const start = performance.now();
      function tick(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        el.textContent = Math.round(progress * target) + '%';
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
    _pctAnimatedPage = currentPage;

    // Mark donut circles as animated so CSS animation only plays once
    $$('.std-donut svg circle[stroke-dasharray], .assistance-circle svg circle[stroke-dasharray]').forEach(c => {
      if (_donutAnimatedPage === currentPage) {
        c.classList.add('donut-animated');
      } else {
        c.addEventListener('animationend', () => c.classList.add('donut-animated'));
      }
    });
    _donutAnimatedPage = currentPage;

    // Profile pic click → change photo
    const poPicWrap = document.getElementById('po-pic-change');
    if (poPicWrap) {
      poPicWrap.addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*';
        inp.onchange = async () => {
          const file = inp.files[0];
          if (!file) return;
          if (file.size > 2 * 1024 * 1024) { alert(t('alert.image_too_large')); return; }
          const session = getSession();
          if (!session || !auth.currentUser) return;
          try {
            const ext = file.name.split('.').pop() || 'jpg';
            const ref = storage.ref('profilePics/' + auth.currentUser.uid + '.' + ext);
            await ref.put(file);
            session.profilePic = await ref.getDownloadURL();
            setSession(session);
            renderPage(session);
          } catch (err) {
            console.error('Profile pic upload failed:', err);
            // Fallback to dataURL
            const reader = new FileReader();
            reader.onload = ev => {
              session.profilePic = ev.target.result;
              setSession(session);
              renderPage(session);
            };
            reader.readAsDataURL(file);
          }
        };
        inp.click();
      });
    }

    // Convocatòria drag-and-drop
    bindConvocatoria();

    /* Staff home rows → the page that owns the thing clicked.
       Each target keeps its own page-state variable, so route through the
       same ones the existing links set rather than inventing a parallel
       path — a row that navigates without setting them lands on a detail
       page rendering whatever was selected last. */
    $$('[data-shome-link]').forEach(row => {
      row.addEventListener('click', () => {
        const to = row.dataset.shomeLink;
        const id = row.dataset.shomeId;
        if (to === 'staff-training-detail') detailTrainingId = id;
        else if (to === 'match-detail') detailMatchId = Number(id);
        else if (to === 'medical-detail') medicalDetailPlayerId = id;
        else if (to === 'staff-player-stats') staffViewPlayerId = id;
        currentPage = to;
        renderPage(getSession());
      });
    });

    // Roster player name click → staff player stats
    $$('.roster-player-link').forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        staffViewPlayerId = a.dataset.playerId;
        currentPage = 'staff-player-stats';
        renderPage(getSession());
      });
    });

    /* Training LIST team filter (single-select), same idiom as the roster
       and medical filters. The detail page's own filter below is a
       multi-select Set because there it narrows a squad, not a calendar. */
    $$('[data-tr-team]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.trTeam;
        trainingTeamFilter = (val === 'all') ? null : val;
        renderPage(getSession());
      });
    });

    // Training detail team filter (multi-select)
    $$('[data-std-team]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.stdTeam;
        if (val === 'all') {
          stdTeamFilter = null;
        } else {
          if (!stdTeamFilter) {
            stdTeamFilter = new Set([val]);
          } else if (stdTeamFilter.has(val)) {
            stdTeamFilter.delete(val);
            if (stdTeamFilter.size === 0) stdTeamFilter = null;
          } else {
            stdTeamFilter.add(val);
          }
        }
        renderPage(getSession());
      });
    });

    // Roster team filter
    $$('[data-roster-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        // Snapshot old chart elements keyed by x-position
        const snapCharts = [];
        $$('.roster-right .rpe-chart-svg').forEach(svg => {
          const dotMap = {};
          svg.querySelectorAll('.rpe-dot').forEach(c => {
            const cx = +c.getAttribute('cx');
            dotMap[cx] = { cx, cy: +c.getAttribute('cy') };
          });
          const lines = [];
          svg.querySelectorAll('.rpe-line').forEach(p => lines.push(p.getAttribute('d')));
          const barMap = {};
          svg.querySelectorAll('.acwr-bar-acute, .acwr-bar-chronic').forEach(r => {
            const x = +r.getAttribute('x');
            barMap[x] = { y: +r.getAttribute('y'), h: +r.getAttribute('height') };
          });
          snapCharts.push({ dotMap, lines, barMap });
        });

        rosterTeamFilter = btn.dataset.rosterFilter;
        $$('.roster-team-btn').forEach(b => b.classList.remove('roster-team-btn-active'));
        btn.classList.add('roster-team-btn-active');
        renderPage(getSession());

        // FLIP-animate dots, lines, and bars to new positions
        const DUR = 350;
        const EASE = 'cubic-bezier(.4,0,.2,1)';
        $$('.roster-right .rpe-chart-svg').forEach((svg, si) => {
          const old = snapCharts[si];
          if (!old) return;
          // Dots – match by cx (same x = same date/week)
          svg.querySelectorAll('.rpe-dot').forEach(c => {
            const cx = +c.getAttribute('cx');
            const prev = old.dotMap[cx];
            if (!prev) return;
            const dy = prev.cy - (+c.getAttribute('cy'));
            if (dy === 0) return;
            c.style.transform = 'translateY(' + dy + 'px)';
            requestAnimationFrame(() => requestAnimationFrame(() => {
              c.style.transition = 'transform ' + DUR + 'ms ' + EASE;
              c.style.transform = '';
              c.addEventListener('transitionend', () => { c.style.transition = ''; c.style.transform = ''; }, { once: true });
            }));
          });
          // Lines – rebuild path each frame from interpolated dot positions
          svg.querySelectorAll('.rpe-line').forEach(p => {
            const newD = p.getAttribute('d');
            // Extract data points: M start + C endpoints
            const pts = [];
            const mMatch = newD.match(/M\s*([\d.\-]+)[,\s]+([\d.\-]+)/);
            if (mMatch) pts.push({ x: +mMatch[1], y: +mMatch[2] });
            const cRe = /C\s*[\d.\-]+[,\s]+[\d.\-]+[,\s]+[\d.\-]+[,\s]+[\d.\-]+[,\s]+([\d.\-]+)[,\s]+([\d.\-]+)/g;
            let cm;
            while ((cm = cRe.exec(newD)) !== null) pts.push({ x: +cm[1], y: +cm[2] });
            if (pts.length < 2) return;
            // Find old Y for each point by matching closest x in dotMap
            const dotXs = Object.keys(old.dotMap).map(Number);
            function closestOldDot(px) {
              let best = null, bestDist = Infinity;
              for (let k = 0; k < dotXs.length; k++) {
                const d = Math.abs(dotXs[k] - px);
                if (d < bestDist) { bestDist = d; best = old.dotMap[dotXs[k]]; }
              }
              return bestDist < 2 ? best : null;
            }
            const deltas = pts.map(pt => {
              const prev = closestOldDot(pt.x);
              return prev ? prev.cy - pt.y : 0;
            });
            if (deltas.every(d => d === 0)) return;
            const t0 = performance.now();
            (function frame() {
              let t = Math.min((performance.now() - t0) / DUR, 1);
              t = 1 - Math.pow(1 - t, 3);
              const interp = pts.map((pt, i) => ({ x: pt.x, y: pt.y + deltas[i] * (1 - t) }));
              p.setAttribute('d', crSplinePath(interp));
              if (t < 1) requestAnimationFrame(frame);
            })();
          });
          // ACWR bars – match by x-position
          svg.querySelectorAll('.acwr-bar-acute, .acwr-bar-chronic').forEach(r => {
            const x = +r.getAttribute('x');
            const prev = old.barMap[x];
            if (!prev) return;
            const dy = prev.y - (+r.getAttribute('y'));
            if (dy === 0) return;
            r.style.transform = 'translateY(' + dy + 'px)';
            requestAnimationFrame(() => requestAnimationFrame(() => {
              r.style.transition = 'transform ' + DUR + 'ms ' + EASE;
              r.style.transform = '';
              r.addEventListener('transitionend', () => { r.style.transition = ''; r.style.transform = ''; }, { once: true });
            }));
          });
        });
      });
    });

    // Matchday
    bindMatchday();

    // Staff Training
    bindStaffTraining();

    // Staff Training Detail
    bindStaffTrainingDetail();

    // Tactical Board
    bindTactics();

    // Read-only board frame animations
    bindRoBoardAnimations();

    // Staff matchday card navigation
    $$('[data-go-staff-match]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        detailMatchId = Number(el.dataset.goStaffMatch);
        detailMatchFrom = 'staff-matchday';
        currentPage = 'match-detail';
        renderPage(getSession());
      });
    });

    // Player actions: clamp Minutes inputs (digits only, max 300)
    $$('.action-minutes').forEach(inp => {
      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/[^0-9]/g, '');
        const v = parseInt(inp.value, 10);
        if (!isNaN(v) && v > 300) inp.value = 300;
      });
    });

    // Player actions: clamp RPE inputs to 0-10
    $$('.action-rpe').forEach(inp => {
      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/[^0-9]/g, '');
        const v = parseInt(inp.value, 10);
        if (!isNaN(v) && v > 10) inp.value = 10;
      });
      inp.addEventListener('blur', () => {
        const v = parseInt(inp.value, 10);
        if (!isNaN(v)) { if (v < 0) inp.value = 0; if (v > 10) inp.value = 10; }
      });
    });

    // Player actions: RPE submit
    $$('.action-submit').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.action-card');
        const rpeInput = card.querySelector('.action-rpe');
        const minInput = card.querySelector('.action-minutes');
        const rpe = parseInt(rpeInput.value, 10);
        const minutes = parseInt(minInput.value, 10);
        if (isNaN(rpe) || rpe < 0 || rpe > 10) { rpeInput.classList.add('input-error'); return; }
        if (isNaN(minutes) || minutes < 0) { minInput.classList.add('input-error'); return; }
        const key = card.dataset.actionKey;
        const tag = card.dataset.actionType;
        const ua = rpe * minutes;
        // Extract the actual activity date from the key or card
        let activityDate;
        let sessionId = '';
        if (tag === 'training') {
          // The suffix is a SESSION ID now, not a date.
          sessionId = key.split('_training_')[1] || '';
          const sess = getTrainings().find(x => String(x.id) === String(sessionId));
          activityDate = sess ? sess.date : '';
          if (!activityDate && /^\d{4}-\d{2}-\d{2}$/.test(sessionId)) {
            activityDate = sessionId;   // a legacy card still keyed by date
            sessionId = '';
          }
        } else {
          const matches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
          const mId = key.split('_match_')[1];
          const mObj = matches.find(m => String(m.id) === mId);
          activityDate = mObj ? mObj.date : '';
        }
        if (!activityDate) { const n = new Date(); activityDate = n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0') + '-' + String(n.getDate()).padStart(2,'0'); }
        const rpeData = JSON.parse(localStorage.getItem('fa_player_rpe') || '{}');
        rpeData[key] = { rpe, minutes, ua, tag, date: activityDate, sessionId };
        // Staff notification
        const session = getSession();
        const actLabel = card.querySelector('.action-label');
        const actDate = card.querySelector('.action-date');
        const actText = (actLabel ? actLabel.textContent : '') + (actDate ? ' · ' + actDate.textContent : '');
        addStaffNotification({
          type: tag === 'match' ? 'match_rpe' : 'training_rpe',
          playerName: session ? session.name : '?',
          detail: 'RPE ' + rpe + ' · ' + minutes + ' min',
          activity: actText
        });
        // Re-render only once the server has acknowledged (or the write is queued)
        ackSaveRecord('rpe', key,
          { uid: session.id, rpe, minutes, ua, tag, date: activityDate, sessionId },
          'fa_player_rpe', JSON.stringify(rpeData), btn).then(() => {
          renderPage(getSession());
          updateActionsBadge();
        });
      });
    });

    // Player actions: Add extra training
    const addExtraBtn = document.getElementById('btn-add-extra');
    if (addExtraBtn) {
      addExtraBtn.addEventListener('click', () => {
        const list = document.getElementById('extra-training-list');
        if (!list) return;
        const id = Date.now();
        const html = `<div class="action-card" data-extra-id="${id}">
          <div class="action-header"><span class="badge" style="background:#78909c;color:#fff;">Extra</span>
            <select class="reg-input action-extra-tag" style="width:auto;font-size:.82rem;">
              <option value="Running">Running</option>
              <option value="Cycling">Cycling</option>
              <option value="Gym">Gym</option>
              <option value="Swimming">Swimming</option>
            </select>
          </div>
          <div class="action-form">
            <div class="action-field"><label>Date</label><input type="text" class="reg-input action-extra-date md-datepicker" data-display-dmy data-allow-past placeholder="dd/mm/yyyy" readonly style="width:120px;cursor:pointer;"></div>
            <div class="action-field"><label data-tooltip="Rate of Perceived Exertion (0–10)">RPE</label><input type="text" inputmode="numeric" class="reg-input action-rpe" maxlength="2"></div>
            <div class="action-field"><label>Minutes</label><input type="text" inputmode="numeric" class="reg-input action-minutes" maxlength="3"></div>
            <button class="btn btn-primary btn-small action-extra-submit">Submit</button>
          </div>
        </div>`;
        list.insertAdjacentHTML('beforeend', html);
        const card = list.querySelector('[data-extra-id="' + id + '"]');
        // Bind date picker
        card.querySelector('.action-extra-date').addEventListener('click', function() { openDatePicker(this); });
        // Bind tooltip on RPE label
        card.querySelectorAll('[data-tooltip]').forEach(el => {
          el.addEventListener('mouseenter', () => {
            const tip = document.getElementById('roster-tooltip');
            if (!tip) return;
            tip.textContent = el.getAttribute('data-tooltip');
            tip.classList.add('visible');
            // Viewport coordinates: .roster-tooltip is position:fixed.
            const rect = el.getBoundingClientRect();
            tip.style.left = rect.left + rect.width / 2 - tip.offsetWidth / 2 + 'px';
            tip.style.top = rect.top - tip.offsetHeight - 10 + 'px';
          });
          el.addEventListener('mouseleave', () => {
            const tip = document.getElementById('roster-tooltip');
            if (tip) tip.classList.remove('visible');
          });
        });
        // Clamp RPE 0-10
        const rpeInp = card.querySelector('.action-rpe');
        rpeInp.addEventListener('input', function() {
          this.value = this.value.replace(/[^0-9]/g, '');
          const v = parseInt(this.value, 10);
          if (!isNaN(v) && v > 10) this.value = 10;
        });
        rpeInp.addEventListener('blur', function() {
          const v = parseInt(this.value, 10);
          if (!isNaN(v)) { if (v < 0) this.value = 0; if (v > 10) this.value = 10; }
        });
        // Clamp Minutes (digits only, max 300)
        const minInp = card.querySelector('.action-minutes');
        minInp.addEventListener('input', function() {
          this.value = this.value.replace(/[^0-9]/g, '');
          const v = parseInt(this.value, 10);
          if (!isNaN(v) && v > 300) this.value = 300;
        });
        // Bind submit
        card.querySelector('.action-extra-submit').addEventListener('click', () => {
          const rpeInput = card.querySelector('.action-rpe');
          const minInput = card.querySelector('.action-minutes');
          const dateInput = card.querySelector('.action-extra-date');
          const rpe = parseInt(rpeInput.value, 10);
          const minutes = parseInt(minInput.value, 10);
          const dateVal = dateInput.dataset.dateIso || dateInput.value;
          if (!dateVal) { dateInput.classList.add('input-error'); return; }
          if (isNaN(rpe) || rpe < 0 || rpe > 10) { rpeInput.classList.add('input-error'); return; }
          if (isNaN(minutes) || minutes < 0) { minInput.classList.add('input-error'); return; }
          const tag = card.querySelector('.action-extra-tag').value;
          const session = getSession();
          const key = session.id + '_extra_' + id;
          const ua = rpe * minutes;
          const rpeData = JSON.parse(localStorage.getItem('fa_player_rpe') || '{}');
          rpeData[key] = { rpe, minutes, ua, tag, date: dateVal };
          addStaffNotification({
            type: 'extra_training',
            playerName: session ? session.name : '?',
            detail: 'RPE ' + rpe + ' · ' + minutes + ' min',
            activity: tag + ' (' + dateVal + ')'
          });
          const extraBtn = card.querySelector('.action-extra-submit');
          ackSaveRecord('rpe', key, { uid: session.id, rpe, minutes, ua, tag, date: dateVal },
            'fa_player_rpe', JSON.stringify(rpeData), extraBtn).then(() => {
            renderPage(session);
          });
        });
      });
    }

    // Activity item navigation (player)
    $$('[data-go-match]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-conv-link]')) return;
        if (e.target.closest('.mavail-btns') || e.target.closest('.mavail-chosen')) return;
        detailMatchId = Number(el.dataset.goMatch);
        detailMatchFrom = currentPage || 'player-matchday';
        currentPage = 'match-detail';
        renderPage(getSession());
      });
    });
    // Convocatòria disponible link → navigate to match detail
    $$('[data-conv-link]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const matchId = el.dataset.convMatch;
        if (matchId) {
          detailMatchId = Number(matchId);
          detailMatchFrom = currentPage || 'player-matchday';
          currentPage = 'match-detail';
          renderPage(getSession());
        }
      });
    });
    // Match availability buttons
    $$('.mavail-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const matchId = btn.closest('.mavail-btns').dataset.mavailMatch;
        const session = getSession();
        const key = session.id + '_' + matchId;
        const maData = JSON.parse(localStorage.getItem('fa_match_availability') || '{}');
        maData[key] = btn.dataset.mavail;
        // Derive fitness status (injury this week + disponible → doubt)
        deriveFitnessStatus(session.id);
        // Staff notification
        const matches = JSON.parse(localStorage.getItem('fa_matches') || '[]');
        const matchObj = matches.find(m => String(m.id) === String(matchId));
        addStaffNotification({
          type: 'match_avail',
          playerName: session ? session.name : '?',
          detail: btn.dataset.mavail === 'disponible' ? 'Disponible' : 'No Disponible',
          activity: matchObj ? (matchObj.home + ' vs ' + matchObj.away + (matchObj.date ? ' · ' + matchObj.date : '')) : 'Match'
        });
        // Re-render only once the server has acknowledged (or the write is queued)
        ackSaveRecord('matchAvail', key, { uid: session.id, matchId: String(matchId), value: btn.dataset.mavail },
          'fa_match_availability', JSON.stringify(maData), btn).then(() => {
          renderPage(session);
          updateActionsBadge();
        });
      });
    });
    // Click chosen match availability badge to re-open
    $$('.mavail-chosen').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const matchId = badge.dataset.mavailMatch;
        const session = getSession();
        const key = session.id + '_' + matchId;
        const maData = JSON.parse(localStorage.getItem('fa_match_availability') || '{}');
        delete maData[key];
        ackRemoveRecord('matchAvail', key,
          'fa_match_availability', JSON.stringify(maData), badge).then(() => {
          renderPage(session);
        });
      });
    });
    $$('[data-go-training]').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-conv-link]')) return;
        if (e.target.closest('.avail-btns') || e.target.closest('.avail-chosen') || e.target.closest('.injury-note-wrap')) return;
        detailTrainingId = el.dataset.goTraining;
        currentPage = 'training-detail';
        renderPage(getSession());
      });
    });

    // Training availability buttons
    $$('.avail-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = btn.dataset.avail;
        const btnsWrap = btn.closest('.avail-btns');
        const sid = btnsWrap.dataset.availSid;
        const sess = getTrainings().find(x => String(x.id) === String(sid));
        if (!sess) return;
        const date = sess.date;
        if (val === 'injured') {
          showBodyMapPicker(btnsWrap, sid);
          return;
        }
        const session = getSession();
        // Written under the SESSION key only. Dual-writing the legacy date
        // key would bring back the same-day last-write-wins this exists to
        // remove.
        const key = recordKey(session.id, sess, 'avail');
        const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
        availData[key] = val;
        // If answering non-injured, clear any injury data and re-derive fitness
        const injNotes2 = JSON.parse(localStorage.getItem('fa_injury_notes') || '{}');
        if (injNotes2[session.id]) {
          delete injNotes2[session.id];
          localStorage.setItem('fa_injury_notes', JSON.stringify(injNotes2));
          const users2 = getUsers();
          const u2 = users2.find(x => x.id === session.id);
          if (u2) { u2.injuryNote = ''; saveUsers(users2); }
        }
        deriveFitnessStatus(session.id);
        // Staff notification
        const tObj = sess;
        const answerMap = { yes: 'Yes', late: 'Late', no: 'No' };
        addStaffNotification({
          type: 'training_avail',
          playerName: session ? session.name : '?',
          detail: answerMap[val] || val,
          activity: (tObj && tObj.focus ? tObj.focus : 'Training') + ' (' + date + ')'
        });
        // Re-render only once the server has acknowledged (or the write is queued)
        // sessionId AND date as fields: the schedulers query on date.
        ackSaveRecord('trainingAvail', key,
          { uid: session.id, sessionId: sess.id, date: date, value: val },
          'fa_training_availability', JSON.stringify(availData), btn).then(() => {
          renderPage(getSession());
          updateActionsBadge();
        });
      });
    });
    // Click chosen badge to re-open options
    $$('.avail-chosen').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const sid = badge.dataset.availSid;
        const sess = getTrainings().find(x => String(x.id) === String(sid));
        if (!sess) return;
        const date = sess.date;
        // Default badge: expand to buttons inline
        if (badge.classList.contains('avail-default')) {
          const parent = badge.parentElement;
          const btnsHtml = `<div class="avail-btns" data-avail-sid="${sanitize(String(sid))}">
            <button class="avail-btn avail-yes" data-avail="yes">${t('avail.yes')}</button>
            <button class="avail-btn avail-late" data-avail="late">${t('avail.late')}</button>
            <button class="avail-btn avail-no" data-avail="no">${t('avail.no')}</button>
            <button class="avail-btn avail-injured" data-avail="injured">${t('avail.injured')}</button>
          </div>`;
          badge.insertAdjacentHTML('afterend', btnsHtml);
          badge.remove();
          // Bind click handlers on newly inserted buttons
          const newBtns = parent.querySelectorAll('.avail-btns[data-avail-sid="' + sid + '"] .avail-btn');
          newBtns.forEach(btn => {
            btn.addEventListener('click', (ev) => {
              ev.stopPropagation();
              const val = btn.dataset.avail;
              const btnsWrap = btn.closest('.avail-btns');
              if (val === 'injured') { showBodyMapPicker(btnsWrap, sid); return; }
              const session = getSession();
              const key = recordKey(session.id, sess, 'avail');
              const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
              availData[key] = val;
              deriveFitnessStatus(session.id);
              const answerMap = { yes: 'Yes', late: 'Late', no: 'No' };
              addStaffNotification({ type: 'training_avail', playerName: session ? session.name : '?', detail: answerMap[val] || val, activity: (sess.focus ? sess.focus : 'Training') + ' (' + date + ')' });
              // Re-render only once the server has acknowledged (or the write is queued)
              ackSaveRecord('trainingAvail', key,
                { uid: session.id, sessionId: sess.id, date: date, value: val },
                'fa_training_availability', JSON.stringify(availData), btn).then(() => {
                renderPage(getSession());
                updateActionsBadge();
              });
            });
          });
          return;
        }
        const session = getSession();
        const key = recordKey(session.id, sess, 'avail');
        const legacyKey = legacyRecordKey(session.id, sess, 'avail');
        const availData = JSON.parse(localStorage.getItem('fa_training_availability') || '{}');
        const wasInjured = availData[key] === 'injured' || availData[legacyKey] === 'injured';
        const hadLegacy = availData[legacyKey] !== undefined;
        delete availData[key];
        delete availData[legacyKey];
        if (wasInjured) {
          const injNotes = JSON.parse(localStorage.getItem('fa_injury_notes') || '{}');
          delete injNotes[session.id];
          localStorage.setItem('fa_injury_notes', JSON.stringify(injNotes));
          const users = getUsers();
          const u = users.find(x => x.id === session.id);
          if (u) { u.fitnessStatus = 'fit'; u.injuryNote = ''; saveUsers(users); }
          deriveFitnessStatus(session.id);
        }
        // The legacy document goes too, best effort: leaving it would let
        // the resolver's date fallback resurrect the answer on next render.
        if (hadLegacy) DB.removeRecord('trainingAvail', legacyKey).catch(() => {});
        ackRemoveRecord('trainingAvail', key,
          'fa_training_availability', JSON.stringify(availData), badge).then(() => {
          renderPage(session);
        });
      });
    });

    // Clear all staff notifications
    const clearNotifsBtn = document.getElementById('btn-clear-notifs');
    if (clearNotifsBtn) {
      clearNotifsBtn.addEventListener('click', () => {
        // Clear only what this coach can see — the blob is club-wide and
        // written whole, so an unfiltered [] wipes other categories too.
        saveStaffNotifications(getStaffNotifications().filter(n => !inMyNotifScope(n)));
        updateStaffNotifBadge();
        renderPage(getSession());
      });
    }

    // UA/RPE chart tooltips
    $$('[data-ua-tip]').forEach(el => {
      el.addEventListener('mouseenter', (e) => {
        const tip = el.dataset.uaTip;
        if (!tip) return;
        let tt = document.getElementById('ua-tooltip');
        if (!tt) {
          tt = document.createElement('div');
          tt.id = 'ua-tooltip';
          tt.className = 'ua-tooltip';
          document.body.appendChild(tt);
        }
        tt.innerHTML = tip;
        tt.classList.add('visible');
        const rect = el.getBoundingClientRect();
        tt.style.left = (rect.left + rect.width / 2) + 'px';
        tt.style.top = (rect.top - 8 + window.scrollY) + 'px';
      });
      el.addEventListener('mouseleave', () => {
        const tt = document.getElementById('ua-tooltip');
        if (tt) tt.classList.remove('visible');
      });
    });

    // Detail back button
    $$('.detail-back').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPage = btn.dataset.back || 'player-home';
        renderPage(getSession());
      });
    });

    // Video link — open in browser popup window
    $$('.detail-video-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const url = link.dataset.videoUrl;
        if (!url) return;
        const sw = screen.width, sh = screen.height;
        const pw = Math.round(sw * 0.55), ph = Math.round(sh * 0.65);
        const pl = sw - pw - 30, pt = sh - ph - 80;
        window.open(url, 'videoPlayer', 'width=' + pw + ',height=' + ph + ',left=' + pl + ',top=' + pt + ',resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no');
      });
    });

    // ── Match Events bindings ──
    // Toggle "+ Event" inline form
    $$('.ev-add-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var side = btn.dataset.evSide;
        var form = document.getElementById('ev-form-' + side);
        if (form) form.hidden = !form.hidden;
      });
    });

    // Event type custom dropdown interactions
    $$('.ev-cs-trigger').forEach(function(trigger) {
      trigger.addEventListener('click', function(e) {
        e.stopPropagation();
        var wrap = trigger.closest('.ev-custom-select');
        var wasOpen = wrap.classList.contains('open');
        // Close all other custom selects
        $$('.ev-custom-select.open').forEach(function(w) { w.classList.remove('open'); });
        if (!wasOpen) {
          wrap.classList.add('open');
          // Position the options panel with fixed positioning
          var opts = wrap.querySelector('.ev-cs-options');
          var rect = trigger.getBoundingClientRect();
          opts.style.left = rect.left + 'px';
          opts.style.width = rect.width + 'px';
          // Check if dropdown fits below, otherwise show above
          var spaceBelow = window.innerHeight - rect.bottom;
          if (spaceBelow < 200 && rect.top > spaceBelow) {
            opts.style.top = 'auto';
            opts.style.bottom = (window.innerHeight - rect.top) + 'px';
          } else {
            opts.style.top = rect.bottom + 'px';
            opts.style.bottom = 'auto';
          }
        }
      });
    });
    $$('.ev-cs-option').forEach(function(opt) {
      opt.addEventListener('click', function(e) {
        e.stopPropagation();
        var wrap = opt.closest('.ev-custom-select');
        var value = opt.dataset.value;
        var label = opt.textContent.trim();
        var icon = opt.querySelector('.ev-cs-icon');
        var iconSrc = icon ? icon.src : '';
        // Update trigger label
        var triggerLabel = wrap.querySelector('.ev-cs-label');
        if (iconSrc) {
          triggerLabel.innerHTML = '<img src="' + iconSrc + '" class="ev-cs-icon" alt="">' + sanitize(label);
        } else {
          triggerLabel.textContent = label;
        }
        // Mark selected
        wrap.querySelectorAll('.ev-cs-option').forEach(function(o) { o.classList.remove('selected'); });
        opt.classList.add('selected');
        // Set hidden input & dispatch change
        var hidden = wrap.querySelector('.ev-cs-value');
        hidden.value = value;
        wrap.classList.remove('open');
        hidden.dispatchEvent(new Event('change'));
      });
    });
    // Close custom dropdown on outside click
    document.addEventListener('click', function() {
      $$('.ev-custom-select.open').forEach(function(w) { w.classList.remove('open'); });
    });

    // Helper: reset a custom select back to placeholder
    function resetCustomSelect(hiddenInput) {
      if (!hiddenInput) return;
      hiddenInput.value = '';
      var wrap = hiddenInput.closest('.ev-custom-select');
      if (!wrap) return;
      var triggerLabel = wrap.querySelector('.ev-cs-label');
      if (triggerLabel) triggerLabel.textContent = hiddenInput.dataset.placeholder || '…';
      wrap.querySelectorAll('.ev-cs-option').forEach(function(o) { o.classList.remove('selected'); });
    }

    // Event type dropdown → show/hide conditional fields progressively
    $$('input.ev-type-select').forEach(function(sel) {
      sel.addEventListener('change', function() {
        var side = sel.dataset.evSide;
        var goalFields = document.querySelector('.ev-goal-fields[data-ev-side="' + side + '"]');
        var changeFields = document.querySelector('.ev-change-fields[data-ev-side="' + side + '"]');
        var confirmRow = document.querySelector('.ev-confirm-row[data-ev-side="' + side + '"]');
        var playerInput = document.querySelector('input.ev-player-select[data-ev-side="' + side + '"]');
        var oppNum = document.querySelector('.ev-opp-number[data-ev-side="' + side + '"]');
        if (goalFields) goalFields.hidden = (sel.value !== 'goal');
        if (changeFields) changeFields.hidden = (sel.value !== 'change');
        if (confirmRow) confirmRow.hidden = !sel.value;
        // Hide player dropdown wrapper for 'change'
        if (playerInput) {
          var pw = playerInput.closest('.ev-custom-select');
          if (pw) pw.hidden = (sel.value === 'change');
        }
        if (oppNum) oppNum.hidden = (sel.value === 'change');
        // Reset sub-fields
        if (goalFields) {
          var gt = goalFields.querySelector('input.ev-goal-type');
          if (gt) { resetCustomSelect(gt); gt.dispatchEvent(new Event('change')); }
        }
      });
    });

    // Goal type dropdown → show jugada oberta fields
    $$('input.ev-goal-type').forEach(function(sel) {
      sel.addEventListener('change', function() {
        var side = sel.dataset.evSide;
        var jugada = document.querySelector('.ev-jugada-fields[data-ev-side="' + side + '"]');
        if (jugada) jugada.hidden = (sel.value !== 'jugada_oberta');
        // Reset detail
        var det = jugada && jugada.querySelector('input.ev-goal-detail');
        if (det) { resetCustomSelect(det); det.dispatchEvent(new Event('change')); }
      });
    });

    // Goal detail dropdown → show assist picker
    $$('input.ev-goal-detail').forEach(function(sel) {
      sel.addEventListener('change', function() {
        var side = sel.dataset.evSide;
        var assistInput = document.querySelector('input.ev-assist-select[data-ev-side="' + side + '"]');
        if (assistInput) {
          var aw = assistInput.closest('.ev-custom-select');
          if (aw) aw.hidden = (sel.value !== 'assistencia');
        }
      });
    });

    // Submit event
    $$('.ev-submit').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var side = btn.dataset.evSide;
        var form = document.getElementById('ev-form-' + side);
        if (!form) return;
        var typeSel = form.querySelector('input.ev-type-select[data-ev-side="' + side + '"]');
        var type = typeSel ? typeSel.value : '';
        if (!type) return;
        var minInput = form.querySelector('.ev-minute[data-ev-side="' + side + '"]');
        var minute = minInput ? minInput.value.trim() : '';

        var ev = {
          id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          side: side,
          type: type,
          minute: minute
        };

        // Our team form
        var playerSel = form.querySelector('input.ev-player-select[data-ev-side="' + side + '"]');
        if (playerSel) {
          if (type !== 'change') {
            ev.playerId = playerSel.value;
            if (!ev.playerId) return;
          }
          if (type === 'goal') {
            var gtSel = form.querySelector('input.ev-goal-type[data-ev-side="' + side + '"]');
            ev.goalType = gtSel ? gtSel.value : '';
            if (ev.goalType === 'jugada_oberta') {
              var detSel = form.querySelector('input.ev-goal-detail[data-ev-side="' + side + '"]');
              ev.goalDetail = detSel ? detSel.value : '';
              if (ev.goalDetail === 'assistencia') {
                var astSel = form.querySelector('input.ev-assist-select[data-ev-side="' + side + '"]');
                ev.assistPlayerId = astSel ? astSel.value : '';
              }
            }
          }
          if (type === 'change') {
            var outSel = form.querySelector('input.ev-player-out[data-ev-side="' + side + '"]');
            var inSel = form.querySelector('input.ev-player-in[data-ev-side="' + side + '"]');
            ev.playerOutId = outSel ? outSel.value : '';
            ev.playerInId = inSel ? inSel.value : '';
            if (!ev.playerOutId || !ev.playerInId) return;
          }
        }

        // Opponent form
        var oppNum = form.querySelector('.ev-opp-number[data-ev-side="' + side + '"]');
        if (oppNum) {
          if (type !== 'change') {
            ev.playerNumber = oppNum.value.trim();
          }
          // Change sub-fields (opponent)
          if (type === 'change') {
            var oppOut = form.querySelector('.ev-opp-out[data-ev-side="' + side + '"]');
            var oppIn = form.querySelector('.ev-opp-in[data-ev-side="' + side + '"]');
            ev.playerOutNumber = oppOut ? oppOut.value.trim() : '';
            ev.playerInNumber = oppIn ? oppIn.value.trim() : '';
          }
        }

        var events = getMatchEvents(detailMatchId);
        events.push(ev);
        saveMatchEvents(detailMatchId, events);
        renderPage(getSession());
      });
    });

    // Delete event
    $$('.ev-delete').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var evId = btn.dataset.evId;
        var events = getMatchEvents(detailMatchId);
        events = events.filter(function(ev) { return ev.id !== evId; });
        saveMatchEvents(detailMatchId, events);
        renderPage(getSession());
      });
    });

    // Date tap popup (mobile) — show match teams
    $$('.pmt-date-tap').forEach(function(el) {
      el.addEventListener('click', function(e) {
        // Remove any existing tooltip
        var old = document.querySelector('.pmt-tooltip');
        if (old) old.remove();
        var td = el.closest('td');
        if (!td) return;
        // Read team names from the sibling Partit column (works even when hidden on mobile)
        var tr = td.closest('tr');
        if (!tr) return;
        var matchCell = tr.querySelector('.pmt-match');
        if (!matchCell) return;
        var spans = matchCell.querySelectorAll('.pmt-stacked span');
        var home = spans[0] ? spans[0].textContent : '';
        var away = spans[1] ? spans[1].textContent : '';
        if (!home && !away) return;
        var tip = document.createElement('div');
        tip.className = 'pmt-tooltip';
        var s1 = document.createElement('span');
        s1.textContent = home;
        var s2 = document.createElement('span');
        s2.textContent = away;
        tip.appendChild(s1);
        tip.appendChild(s2);
        // Append to body with fixed positioning so it's never clipped
        document.body.appendChild(tip);
        var rect = el.getBoundingClientRect();
        tip.style.left = rect.left + 'px';
        tip.style.top = (rect.top - tip.offsetHeight - 4) + 'px';
        var autoHide = setTimeout(function() { if (tip.parentNode) tip.remove(); }, 3000);
        // Dismiss on any tap outside
        function dismiss() { clearTimeout(autoHide); if (tip.parentNode) tip.remove(); document.removeEventListener('click', dismiss, true); }
        setTimeout(function() { document.addEventListener('click', dismiss, true); }, 0);
        e.stopPropagation();
      });
    });

    // Starting XI toggle (DOM-only update, no full re-render)
    $$('.starter-toggle').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var pid = btn.dataset.playerId;
        var mid = btn.dataset.matchId;
        var xi = getStartingXI(mid);
        var idx = xi.findIndex(function(id) { return String(id) === pid; });
        if (idx !== -1) {
          xi.splice(idx, 1);
        } else {
          if (xi.length >= 11) return;
          xi.push(pid);
        }
        saveStartingXI(mid, xi);
        // Update DOM directly instead of re-rendering
        var isNowStarter = idx === -1;
        btn.classList.toggle('starter-active', isNowStarter);
        btn.title = isNowStarter ? 'Treure de titulars' : 'Afegir a titulars';
        var row = btn.closest('.detail-player');
        if (row) row.classList.toggle('detail-player-starter', isNowStarter);
        // Update counter
        var counter = document.querySelector('.starter-counter');
        if (counter) {
          var newCount = xi.length;
          var warnCls = newCount === 11 ? 'starter-count-ok' : (newCount > 11 ? 'starter-count-over' : 'starter-count-under');
          var warnIcon = newCount !== 11 ? ' <span class="starter-emoji">⚠️</span>' : ' <span class="starter-emoji">✅</span>';
          counter.className = 'starter-counter ' + warnCls;
          counter.innerHTML = 'Titulars: <strong>' + newCount + '/11</strong>' + warnIcon;
        }
      });
    });

    // Roster tooltips (JS-based)
    let tooltipEl = document.getElementById('roster-tooltip');
    if (!tooltipEl) {
      tooltipEl = document.createElement('div');
      tooltipEl.id = 'roster-tooltip';
      tooltipEl.className = 'roster-tooltip';
      document.body.appendChild(tooltipEl);
    }
    $$('[data-tooltip]').forEach(icon => {
      // client*, not page*: .roster-tooltip is position:fixed, so it is
      // placed against the viewport. See the rule in style.css.
      icon.addEventListener('mouseenter', (e) => {
        tooltipEl.textContent = icon.getAttribute('data-tooltip');
        tooltipEl.classList.add('visible');
        tooltipEl.style.left = e.clientX - tooltipEl.offsetWidth / 2 + 'px';
        tooltipEl.style.top = e.clientY - tooltipEl.offsetHeight - 12 + 'px';
      });
      icon.addEventListener('mousemove', (e) => {
        tooltipEl.style.left = e.clientX - tooltipEl.offsetWidth / 2 + 'px';
        tooltipEl.style.top = e.clientY - tooltipEl.offsetHeight - 12 + 'px';
      });
      icon.addEventListener('mouseleave', () => {
        tooltipEl.classList.remove('visible');
      });
    });

    // Staff: remove player from registrations
    // Staff: take a member out of the squad. NOT a delete — this is the
    // path for a player moving up a category. Their email comes off this
    // team's list and their squad assignment is cleared; club membership,
    // availability, RPE, injuries and stats are all untouched, so when the
    // next coach adds the same address everything is simply there again.
    $$('.btn-remove-reg').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid = btn.dataset.uid;
        const user = getUsers().find(u => String(u.id) === String(uid));
        if (!user) return;
        showModal(
          t('confirm.leave_squad_title'),
          t('confirm.leave_squad_msg').replace('{name}', user.name || ''),
          async () => {
            const session = getSession();
            const email = normalizeEmail(user.email);
            const key = (user.category || '') + '-' + (user.team || '');
            try {
              // 1. Off the roster list. This is the gate, so it goes first.
              if (session && session.teamId && email && user.category && user.team) {
                const roster = (_clubConfig && _clubConfig.rosters &&
                  _clubConfig.rosters[key]) || { staffEmails: [], playerEmails: [] };
                const kept = (roster.playerEmails || [])
                  .filter(e => normalizeEmail(e) !== email);
                if (kept.length !== (roster.playerEmails || []).length) {
                  await saveRoster(session.teamId, key, 'playerEmails', kept);
                  roster.playerEmails = kept;
                  if (_clubConfig && _clubConfig.rosters) _clubConfig.rosters[key] = roster;
                }
              }
              // 2. Clear the squad assignment. onRosterWritten does this too,
              // but only for a member whose email was actually listed — do it
              // here as well so the UI is right immediately and so members who
              // were never on a list still detach. Shared with the ✕ on the
              // pre-registered card so both routes behave identically.
              await detachMemberByEmail(email || user.email);
              renderPage(getSession());
            } catch (err) {
              console.error('leave squad failed:', err);
              _showPushToast(t('save.sync_title'), t('save.error_perms'));
            }
          },
          { confirmLabel: t('btn.leave_squad'), danger: false }
        );
      });
    });

    // Admin: toggle role
    // (The .btn-toggle-role handler that lived here is gone with the buttons:
    // it only rewrote the local fa_users blob and never called setRole, so a
    // role appeared to change while the person's permissions did not.)

    // Admin: erase the person entirely. Unlike "leave the squad" on the
    // Registrations page, this destroys the account and all their data —
    // hence the typed confirmation and the server-side function.
    $$('.btn-delete-user').forEach(btn => {
      btn.addEventListener('click', () => {
        showDeleteMemberModal(btn.dataset.uid);
      });
    });

    // Admin: new season
    const newSeasonBtn = $('#btn-new-season');
    if (newSeasonBtn) {
      newSeasonBtn.addEventListener('click', () => {
        showNewSeasonModal();
      });
    }

    const archivedSeasonsBtn = $('#btn-archived-seasons');
    if (archivedSeasonsBtn) {
      archivedSeasonsBtn.addEventListener('click', function() {
        currentPage = 'archived-seasons';
        renderPage(getSession());
      });
    }

    // SuperUser: create club
    const createClubBtn = document.getElementById('btn-create-club');
    if (createClubBtn) {
      _loadClubList();
      createClubBtn.addEventListener('click', async () => {
        const nameEl = document.getElementById('new-club-name');
        const emailEl = document.getElementById('new-club-email');
        const badgeEl = document.getElementById('new-club-badge');
        const resultEl = document.getElementById('create-club-result');
        const name = nameEl.value.trim();
        const email = emailEl.value.trim().toLowerCase();
        if (!name || !email) { resultEl.textContent = 'Nom i email obligatoris.'; resultEl.hidden = false; return; }
        createClubBtn.disabled = true;
        createClubBtn.textContent = 'Creant…';
        try {
          const badgeFile = badgeEl.files && badgeEl.files[0] ? badgeEl.files[0] : null;
          const club = await createClub(name, email, badgeFile);
          resultEl.innerHTML = `<span style="color:var(--success);font-weight:600;">Club creat! Codi: <span style="font-family:monospace;font-size:1.1em;letter-spacing:.15em;">${club.code}</span></span>`;
          resultEl.hidden = false;
          nameEl.value = ''; emailEl.value = ''; badgeEl.value = '';
          // If the superuser is also the team lead, auto-join them to this club
          var sess = getSession();
          if (sess && club.leadEmail === (sess.email || '').toLowerCase()) {
            sess.teamId = club.id;
            sess.isTeamLead = true;
            _currentSession = sess;  // update in-memory immediately
            await db.collection('users').doc(sess.id).set({ teamId: club.id, isTeamLead: true }, { merge: true });
            await loadClubConfig(club.id);
            await DB.init(club.id, getVisibleCategories());
          }
          _loadClubList();
          // Re-render settings so "Editar categories" appears
          renderPage(getSession());
        } catch (err) {
          resultEl.textContent = 'Error: ' + err.message;
          resultEl.hidden = false;
          console.error(err);
        }
        createClubBtn.disabled = false;
        createClubBtn.textContent = 'Crear Club';
      });
    }

    // SuperUser / Team Lead / Player: delegated handlers on dashboard-content
    const content = document.getElementById('dashboard-content');
    if (content && !content._settingsBound) {
      content._settingsBound = true;
      content.addEventListener('click', e => {
        // Team Lead: edit categories
        if (e.target.closest('#btn-edit-categories')) {
          // The only voluntary entry, so the only one that may be left.
          showTeamSetup({ cancellable: true });
          return;
        }
        // Dismiss the "old build" banner for this required version only.
        const updClose = e.target.closest('.upd-close');
        if (updClose) {
          const bar = updClose.closest('.upd-banner');
          if (bar) {
            localStorage.setItem('fa_update_dismissed', bar.dataset.need);
            bar.remove();
          }
          return;
        }
        // SuperUser: click a club crest to replace it
        const badgeEl = e.target.closest('.club-badge-edit');
        if (badgeEl) {
          const picker = document.createElement('input');
          picker.type = 'file';
          picker.accept = 'image/*';
          picker.addEventListener('change', () => {
            if (picker.files && picker.files[0]) {
              changeClubBadge(badgeEl.dataset.club, picker.files[0]);
            }
          });
          picker.click();
          return;
        }
        // SuperUser: hand a club over to a new team lead
        const leadBtn = e.target.closest('.btn-save-lead');
        if (leadBtn) {
          _saveLeadEmail(leadBtn.dataset.club);
          return;
        }
        // SuperUser: copy club code
        const btn = e.target.closest('.btn-copy-code');
        if (btn) {
          const code = btn.dataset.code;
          navigator.clipboard.writeText(code).then(() => {
            btn.textContent = '✓';
            setTimeout(() => { btn.textContent = '📋'; }, 1500);
          }).catch(() => {
            prompt('Copia el codi:', code);
          });
          return;
        }
        // Player: toggle league table visibility (in-place, no full re-render)
        const toggleBtn = e.target.closest('.league-toggle-btn');
        if (toggleBtn) {
          const lid = toggleBtn.dataset.leagueId;
          var hidden = _getHiddenLeagues();
          var idx = hidden.indexOf(lid);
          if (idx !== -1) hidden.splice(idx, 1);
          else hidden.push(lid);
          _setHiddenLeagues(hidden);
          const card = toggleBtn.closest('.league-snippet');
          if (!card) return;
          const nowHidden = idx === -1; // was not hidden, now it is
          card.classList.toggle('league-hidden', nowHidden);
          const titleEl = card.querySelector('.card-title');
          if (titleEl) titleEl.style.marginBottom = nowHidden ? '0' : '.5rem';
          toggleBtn.textContent = nowHidden ? '👁️\u200D🗨️' : '👁️';
          toggleBtn.title = nowHidden ? 'Mostrar classificació' : 'Amagar classificació';
          const scroll = card.querySelector('.league-scroll');
          if (scroll) scroll.style.display = nowHidden ? 'none' : '';
        }
      });
    }
  }

  // #endregion Event Bindings

  // #region Init & Bootstrap
  // ---------- Init ----------
  function init() {
    // Apply saved language to HTML data-i18n elements
    document.documentElement.setAttribute('data-lang', _lang);
    applyI18nHtml();

    $('#form-login').addEventListener('submit', handleLogin);
    $('#form-register').addEventListener('submit', handleRegister);
    $('#form-profile-setup').addEventListener('submit', handleProfileSetup);
    $('#form-join-club').addEventListener('submit', handleJoinClub);
    $('#btn-join-logout').addEventListener('click', () => auth.signOut());

    // Password eye toggle (hold to show)
    document.querySelectorAll('.pw-eye').forEach(btn => {
      const input = btn.parentElement.querySelector('input');
      btn.addEventListener('mousedown', (e) => { e.preventDefault(); input.type = 'text'; btn.classList.add('pw-eye-active'); });
      btn.addEventListener('mouseup', () => { input.type = 'password'; btn.classList.remove('pw-eye-active'); });
      btn.addEventListener('mouseleave', () => { input.type = 'password'; btn.classList.remove('pw-eye-active'); });
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); input.type = 'text'; btn.classList.add('pw-eye-active'); });
      btn.addEventListener('touchend', () => { input.type = 'password'; btn.classList.remove('pw-eye-active'); });
    });
    $('#profile-pic-input').addEventListener('change', handleProfilePicChange);
    const dobEl = $('#setup-dob');
    dobEl.addEventListener('click', function(e) {
      if (this.selectionStart === this.value.length || !this.value) openDatePicker(this);
    });
    dobEl.addEventListener('input', function() {
      let digits = this.value.replace(/\D/g, '');
      if (digits.length > 8) digits = digits.slice(0, 8);
      let formatted = '';
      if (digits.length > 0) formatted = digits.slice(0, 2);
      if (digits.length >= 3) formatted += '/' + digits.slice(2, 4);
      if (digits.length >= 5) formatted += '/' + digits.slice(4, 8);
      this.value = formatted;
      // Auto-set ISO if complete
      if (digits.length === 8) {
        const dd = digits.slice(0, 2), mm = digits.slice(2, 4), yyyy = digits.slice(4, 8);
        const iso = yyyy + '-' + mm + '-' + dd;
        const d = new Date(iso + 'T12:00:00');
        if (!isNaN(d.getTime()) && d.getDate() === Number(dd) && d.getMonth() + 1 === Number(mm)) {
          this.dataset.dateIso = iso;
        } else {
          this.dataset.dateIso = '';
        }
      } else {
        this.dataset.dateIso = '';
      }
    });
    dobEl.addEventListener('blur', function() {
      const v = this.value.trim();
      const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m) {
        const dd = m[1], mm = m[2], yyyy = m[3];
        const iso = yyyy + '-' + mm + '-' + dd;
        const d = new Date(iso + 'T12:00:00');
        if (!isNaN(d.getTime()) && d.getDate() === Number(dd) && d.getMonth() + 1 === Number(mm)) {
          this.dataset.dateIso = iso;
        }
      }
    });

    $('#go-register').addEventListener('click', (e) => { e.preventDefault(); showView('#view-register'); });
    $('#go-login').addEventListener('click', (e) => { e.preventDefault(); showView('#view-login'); });

    // Auth screen language switchers (+ nav switcher handled below)
    $$('.auth-lang .lang-link').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        setLang(el.dataset.lang);
      });
    });

    // Regular user: pick one role
    $$('.btn-select-role').forEach(btn => {
      btn.addEventListener('click', () => selectRole(btn.dataset.role));
    });

    // Admin: confirm multi-role selection
    $('#btn-confirm-admin-roles').addEventListener('click', confirmAdminRoles);

    // Nav actions
    $('#btn-logout').addEventListener('click', async () => {
      currentPage = '';
      try { await Push.removeToken(); } catch (e) { console.warn(e); }
      auth.signOut(); // onAuthStateChanged handles cleanup + navigate
    });

    // Language switcher
    $$('.lang-link').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        setLang(el.dataset.lang);
      });
    });
    // Initialise active state
    $$('.lang-link').forEach(el => {
      el.classList.toggle('active', el.dataset.lang === _lang);
    });

    // Logo toggles sidebar on mobile
    const sidebarEl = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const topnavLogo = document.querySelector('.topnav-logo');
    function toggleSidebar() {
      const isOpen = sidebarEl.classList.toggle('open');
      sidebarOverlay.classList.toggle('open', isOpen);
    }
    function closeSidebar() {
      sidebarEl.classList.remove('open');
      sidebarOverlay.classList.remove('open');
    }
    topnavLogo.addEventListener('click', () => {
      if (window.innerWidth <= 600) toggleSidebar();
    });
    sidebarOverlay.addEventListener('click', closeSidebar);

    // ── Registrations: delegated auto-save (survives DOM re-renders) ──
    (function () {
      const content = document.getElementById('dashboard-content');
      if (!content) return;

      function autoSaveFromRow(row) {
        if (!row || !row.dataset.uid) return;
        const uid = row.dataset.uid;
        const selPos = Array.from(row.querySelectorAll('.reg-pos-chip.active')).map(c => c.dataset.pos);
        const position = selPos.join(',');
        const numEl = row.querySelector('.reg-number');
        const playerNumber = numEl ? numEl.value.trim() : '';
        const activeTeam = row.querySelector('.reg-team-circle.active');
        const team = activeTeam ? activeTeam.dataset.team : '';
        const catEl = row.querySelector('.reg-cat-select');
        const category = catEl ? catEl.value : '';

        let users = getUsers();
        const user = users.find(u => String(u.id) === String(uid));
        if (!user) return;

        // The status dropdown is lead-only (see renderRegistrations): the
        // setRole function rejects role changes from anyone else, and for
        // months that rejection was swallowed into a console.warn while the
        // screen happily showed the new role. Absent = leave roles alone.
        const statusEl = row.querySelector('.reg-status-select');
        const rolesBefore = (user.roles || []).slice();
        if (statusEl) {
          const statusVal = statusEl.value;
          // Keep "lead": it is server-derived from isTeamLead and dropping it
          // locally would make the lead's own row flicker out of its role
          // until the server put it back.
          const keepLead = rolesBefore.includes('lead') ? ['lead'] : [];
          if (statusVal === 'both') user.roles = ['player', 'staff'].concat(keepLead);
          else if (statusVal === 'player') user.roles = ['player'].concat(keepLead);
          else if (statusVal === 'staff') user.roles = ['staff'].concat(keepLead);
        }

        user.position = position;
        user.playerNumber = playerNumber;
        user.team = team;
        user.category = category;
        saveUsers(users);

        // Sync key fields to Firestore user profile. Roles go through the
        // setRole function so the member's Auth claims stay in sync.
        if (typeof uid === 'string' && isNaN(Number(uid))) {
          db.collection('users').doc(uid).set({
            position: position, playerNumber: playerNumber,
            team: team, category: category
          }, { merge: true }).catch(console.error);

          const rolesChanged = statusEl &&
            (rolesBefore.length !== user.roles.length ||
             rolesBefore.some((r, i) => r !== user.roles[i]));
          if (rolesChanged) {
            const revert = (err) => {
              console.error('setRole failed:', err);
              // Put the roster back the way the server actually has it,
              // rather than leaving a role on screen that does not exist.
              const list = getUsers();
              const u2 = list.find(u => String(u.id) === String(uid));
              if (u2) { u2.roles = rolesBefore; saveUsers(list); }
              _showPushToast(t('save.sync_title'),
                err && err.code === 'permission-denied' ?
                  t('error.role_change_denied') : t('save.error'));
              if (currentPage === 'registrations') renderPage(getSession());
            };
            try {
              const fn = firebase.app().functions('us-central1').httpsCallable('setRole');
              fn({ uid: uid, roles: user.roles }).catch(revert);
            } catch (e) { revert(e); }
          }
        }

        if (_currentSession && String(_currentSession.id) === String(uid)) {
          _currentSession.roles = user.roles;
          _currentSession.position = position;
          _currentSession.playerNumber = playerNumber;
          _currentSession.team = team;
          _currentSession.category = category;
        }
      }

      // ── Pre-registered player email lists ──
      // Pre-registration: one address + one team letter + Add. The write is
      // awaited and reported — a silently dropped one locks a real player out.
      content.addEventListener('click', e => {
        if (e.target.closest('#reg-add-btn')) {
          addPreRegisteredPlayer();
          return;
        }
        // Removing an invited address that nobody has claimed. Registered
        // members use .btn-remove-reg, which also clears their assignment;
        // here there is no user document, only the list entry.
        const pendBtn = e.target.closest('.btn-remove-pending');
        if (pendBtn) {
          removePreRegisteredPlayer(pendBtn.dataset.pendingEmail, pendBtn.dataset.pendingKey);
          return;
        }
        // Put an unassigned member back into a squad.
        const assignBtn = e.target.closest('.btn-assign');
        if (assignBtn) {
          const row = assignBtn.closest('tr');
          if (!row) return;
          const catSel = row.querySelector('.reg-assign-cat');
          const teamSel = row.querySelector('.reg-assign-team');
          assignMemberToTeam(assignBtn.dataset.uid,
            catSel ? catSel.value : '', teamSel ? teamSel.value : '');
        }
      });
      content.addEventListener('keydown', e => {
        if (e.target.id === 'reg-add-email' && e.key === 'Enter') {
          e.preventDefault();
          addPreRegisteredPlayer();
        }
      });
      // Delegated (mouseover/mouseout bubble, mouseenter/mouseleave do not),
      // so the dots keep their tooltip across re-renders.
      content.addEventListener('mouseover', e => {
        const dot = e.target.closest && e.target.closest('.reg-dot');
        if (dot) showHoverTip(dot, dot.dataset.tip);
      });
      content.addEventListener('mouseout', e => {
        if (e.target.closest && e.target.closest('.reg-dot')) hideHoverTip();
      });
      // A tooltip pinned to viewport coordinates does not follow its dot when
      // the pane scrolls underneath it.
      content.addEventListener('scroll', hideHoverTip, true);

      // Status select or category select change
      content.addEventListener('change', e => {
        // Unassigned card: team letters belong to the chosen category, so the
        // second dropdown has to follow the first.
        if (e.target.classList.contains('reg-assign-cat')) {
          const row = e.target.closest('tr');
          const teamSel = row && row.querySelector('.reg-assign-team');
          if (teamSel) {
            teamSel.innerHTML = getTeamLetters(e.target.value)
              .map(l => '<option value="' + l + '">' + l + '</option>').join('');
          }
          return;
        }
        if (e.target.classList.contains('reg-status-select')) {
          autoSaveFromRow(e.target.closest('tr'));
        }
        if (e.target.classList.contains('reg-cat-select')) {
          // Re-render team circles for the new category's letters
          const row = e.target.closest('tr');
          const uid = row.dataset.uid;
          const newCat = e.target.value;
          const teamCell = row.querySelector('.reg-team-cell');
          if (teamCell) {
            teamCell.innerHTML = getTeamLetters(newCat).map(function(l) {
              return '<span class="reg-team-circle" data-uid="' + uid + '" data-team="' + l + '">' + l + '</span>';
            }).join('');
          }
          autoSaveFromRow(row);
        }
      });

      // Player number input
      content.addEventListener('input', e => {
        if (e.target.classList.contains('reg-number')) {
          autoSaveFromRow(e.target.closest('tr'));
        }
      });

      // Team circle + position chip clicks
      content.addEventListener('click', e => {
        const circle = e.target.closest('.reg-team-circle');
        if (circle) {
          const row = circle.closest('tr');
          row.querySelectorAll('.reg-team-circle').forEach(c => c.classList.remove('active'));
          circle.classList.add('active');
          autoSaveFromRow(row);
          return;
        }
        const chip = e.target.closest('.reg-pos-chip');
        if (chip) {
          if (chip.classList.contains('active')) {
            chip.classList.remove('active');
          } else {
            const row = chip.closest('tr');
            if (row.querySelectorAll('.reg-pos-chip.active').length >= 3) {
              const cell = chip.closest('.reg-pos-cell');
              let tip = cell.querySelector('.reg-pos-tip');
              if (!tip) {
                tip = document.createElement('span');
                tip.className = 'reg-pos-tip';
                tip.textContent = 'max. three positions';
                cell.appendChild(tip);
                setTimeout(() => tip.remove(), 1800);
              }
              return;
            }
            chip.classList.add('active');
          }
          autoSaveFromRow(chip.closest('tr'));
        }
      });
    })();

    // ── Tactical board ↔ teams linking (delegated) ──
    (function () {
      const content = document.getElementById('dashboard-content');
      if (!content) return;

      content.addEventListener('click', e => {
        // "Afegir equips" button
        const linkBtn = e.target.closest('.tb-link-teams');
        if (linkBtn) {
          const boardName = linkBtn.dataset.boardName;
          const tdate = linkBtn.dataset.tdate;
          // Compared by SESSION, not date: two squads share a date bucket.
          if (!_generatedTeams || !_generatedTeamsId ||
              String(_generatedTeamsId) !== String(linkBtn.dataset.tsid)) return;
          const trainingBoards = JSON.parse(localStorage.getItem('fa_tactic_training_boards') || '{}');
          const boards = trainingBoards[tdate];
          if (!boards) return;
          const board = boards.find(b => b.name === boardName);
          if (!board) return;
          board.linkedTeams = _generatedTeams.map((team, ti) => ({
            name: 'Equip ' + (ti + 1),
            players: team.map(p => ({ id: p.id, name: p.name, position: p.position || '', team: p.team || '', playerNumber: p.playerNumber || '' }))
          }));
          localStorage.setItem('fa_tactic_training_boards', JSON.stringify(trainingBoards));
          _refreshStdBoards(tdate);
          return;
        }

        // "Remove teams" button
        const unlinkBtn = e.target.closest('.tb-unlink-teams');
        if (unlinkBtn) {
          const boardName = unlinkBtn.dataset.boardName;
          const tdate = unlinkBtn.dataset.tdate;
          const trainingBoards = JSON.parse(localStorage.getItem('fa_tactic_training_boards') || '{}');
          const boards = trainingBoards[tdate];
          if (!boards) return;
          const board = boards.find(b => b.name === boardName);
          if (!board) return;
          delete board.linkedTeams;
          localStorage.setItem('fa_tactic_training_boards', JSON.stringify(trainingBoards));
          _refreshStdBoards(tdate);
          return;
        }
      });
    })();

    // Listen for Firebase Auth state changes (fires on page load + login/logout)
    auth.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        // Only load profile if not already set by handleLogin/handleRegister
        if (!_currentSession || _currentSession.id !== firebaseUser.uid) {
          try {
            const doc = await db.collection('users').doc(firebaseUser.uid).get();
            if (doc.exists) {
              const user = doc.data();
              user.id = firebaseUser.uid;
              user.isAdmin = user.email === ADMIN_EMAIL;
              if (user.isTeamLead === undefined) user.isTeamLead = false;
              if (!user.category) user.category = '';
              // Drives getVisibleCategories() — written server-side from the
              // club's staff email lists.
              if (!Array.isArray(user.staffCategories)) user.staffCategories = [];
              _currentSession = user;
              // No club yet → the app routes to the join-club view; membership
              // is assigned only by the joinClub Cloud Function (leads included).
              if (!user.teamId || user.teamId === 'default') {
                user.teamId = 'none';
              }
              // Update localStorage for compat
              let users = getUsers();
              users = users.filter(u => String(u.id) !== String(user.id) && u.email !== user.email);
              users.push(user);
              saveUsers(users);
            }
          } catch (err) {
            console.error('Failed to load user profile:', err);
          }
        }
        // Sync team data (idempotent if already initialised by form handler)
        if (_currentSession) {
          const tid = _currentSession.teamId;
          if (tid && tid !== 'none' && tid !== 'default') {
            try {
              await loadClubConfig(tid);
              await DB.init(tid, getVisibleCategories());
              // Prune at most once per day per device (local-only flag) —
              // avoids rewriting RPE data on every auth refresh.
              const _today = new Date().toISOString().slice(0, 10);
              if (localStorage.getItem('fa_last_rpe_prune') !== _today) {
                pruneOldRpe();
                localStorage.setItem('fa_last_rpe_prune', _today);
              }
            } catch (e) { console.error(e); }
          }
          // Initialize push notifications
          Push.init();
          Push.requestPermission().catch(e => console.warn('Push permission:', e));

          // Watch own profile for claims changes (joinClub/setRole stamp
          // claimsUpdatedAt) and force-refresh the ID token so security
          // rules see the new teamId/role without re-login.
          if (_claimsUnsub) { _claimsUnsub(); _claimsUnsub = null; }
          _claimsUnsub = db.collection('users').doc(firebaseUser.uid).onSnapshot(async (doc) => {
            if (!doc.exists) return;
            const cu = doc.data().claimsUpdatedAt;
            if (!cu || typeof cu.toMillis !== 'function') return;
            const ms = cu.toMillis();
            if (_lastClaimsMs && ms <= _lastClaimsMs) return;
            const first = !_lastClaimsMs;
            _lastClaimsMs = ms;
            if (first) return; // initial snapshot — token already current
            try {
              await firebaseUser.getIdToken(true);
              const res = await firebaseUser.getIdTokenResult();
              const claimTeam = res.claims.teamId;
              const s = getSession();
              if (!s) return;
              if (claimTeam && s.teamId !== claimTeam) {
                s.teamId = claimTeam;
                _currentSession = s;
                await loadClubConfig(claimTeam);
                await DB.init(claimTeam, getVisibleCategories());
                navigate();
                return;
              }
              // Same club, but membership may have changed: the lead adding
              // or removing an address on a roster list re-derives roles and
              // staffCategories server-side (onRosterWritten). Pull them off
              // this very snapshot so an open app gains or loses staff pages
              // without a reload.
              const d = doc.data();
              const nextRoles = Array.isArray(d.roles) ? d.roles : [];
              const nextCats = Array.isArray(d.staffCategories) ? d.staffCategories : [];
              const changed =
                nextRoles.join(',') !== (s.roles || []).join(',') ||
                nextCats.join(',') !== (s.staffCategories || []).join(',') ||
                (d.category || '') !== (s.category || '') ||
                (d.team || '') !== (s.team || '');
              if (!changed) return;
              s.roles = nextRoles;
              s.staffCategories = nextCats;
              s.category = d.category || '';
              s.team = d.team || '';
              _currentSession = s;
              /* The category filter may now point somewhere out of bounds.
                 Back to null, not '': this is "forget the choice and use
                 the default again", whereas '' would silently pin them to
                 Totes — a filter they never asked for. */
              if (_viewCategory && getVisibleCategories().indexOf(_viewCategory) === -1) {
                _viewCategory = null;
              }
              // Roster visibility follows the new categories.
              if (_clubConfig) _clubConfig.rosters = await loadRosters(s.teamId, _clubConfig);
              // So does the sharded data subscription: from Stage C the
              // data/ listener is filtered by category, and a promoted coach
              // who keeps the old subscription never sees his new squad.
              // A no-op while the scope is unchanged — init() early-returns.
              syncDbScope();
              await DB.init(s.teamId, getVisibleCategories());
              currentPage = '';
              navigate();
            } catch (e) { console.warn('Claims refresh failed:', e); }
          });
        }
      } else {
        _currentSession = null;
        _clubConfig = null;
        if (_claimsUnsub) { _claimsUnsub(); _claimsUnsub = null; }
        _lastClaimsMs = 0;
        DB.cleanup();
      }
      // A form handler is driving: it will navigate when it is done, and it
      // may be showing an error we must not wipe. See _authFlowBusy.
      if (_authFlowBusy) return;
      navigate();
    });

    // Re-render current page when Firestore pushes remote changes —
    // but ONLY when the changed key is actually displayed on the current
    // page (KEY_PAGES). Unmapped keys (e.g. fa_users, read everywhere)
    // conservatively re-render every page. Badges refresh either way.
    // Debounced to avoid flicker; skips pages with active editing.
    const KEY_PAGES = {
      fa_training_availability: ['staff-home', 'player-home', 'player-actions', 'training', 'training-detail', 'staff-training', 'staff-training-detail', 'my-stats', 'manage-roster', 'medical'],
      fa_match_availability: ['staff-home', 'player-home', 'player-actions', 'player-matchday', 'staff-matchday', 'matchday', 'convocatoria', 'match-detail'],
      fa_player_rpe: ['staff-home', 'player-home', 'player-actions', 'my-stats', 'staff-player-stats', 'manage-roster', 'staff-training-detail'],
      fa_training: ['staff-home', 'player-home', 'player-actions', 'training', 'training-detail', 'staff-training', 'staff-training-detail', 'my-stats'],
      fa_matches: ['staff-home', 'player-home', 'player-actions', 'player-matchday', 'staff-matchday', 'matchday', 'convocatoria', 'match-detail', 'my-stats', 'staff-player-stats'],
      fa_matchday: ['player-home', 'player-matchday', 'staff-matchday', 'matchday'],
      fa_staff_notifications: ['staff-notifications'],
      fa_injury_notes: ['player-home', 'my-stats', 'medical', 'medical-detail', 'manage-roster', 'training-detail', 'staff-training-detail'],
      fa_injury_dismissed: ['medical', 'medical-detail', 'manage-roster', 'staff-training-detail'],
      fa_injury_zone: ['my-stats', 'medical', 'medical-detail'],
      fa_injuries: ['staff-home', 'player-home', 'my-stats', 'medical', 'medical-detail', 'manage-roster', 'staff-training-detail', 'staff-player-stats'],
      fa_training_staff_override: ['staff-home', 'player-home', 'training', 'training-detail', 'staff-training', 'staff-training-detail'],
      fa_convocatoria_sent: ['staff-home', 'player-home', 'player-actions', 'player-matchday', 'staff-matchday', 'matchday', 'convocatoria', 'match-detail'],
      fa_convocatoria_callup: ['player-matchday', 'staff-matchday', 'matchday', 'convocatoria', 'match-detail'],
      fa_match_goals: ['player-matchday', 'staff-matchday', 'matchday', 'match-detail', 'my-stats', 'staff-player-stats'],
      fa_match_events: ['player-home', 'player-matchday', 'staff-matchday', 'matchday', 'match-detail', 'my-stats', 'staff-player-stats'],
      fa_tactic_saved: ['tactics'],
      fa_tactic_match_boards: ['tactics', 'match-detail', 'convocatoria'],
      fa_tactic_training_boards: ['tactics', 'training-detail', 'staff-training-detail'],
    };
    var _syncDebounce = null;
    window.addEventListener('firestore-sync', (e) => {
      // Badges are cheap — keep them fresh regardless of the current page
      updateActionsBadge();
      updateStaffNotifBadge();
      if (['registrations', 'training-detail', 'staff-training-detail', 'match-detail'].includes(currentPage)) return;
      const key = e.detail && e.detail.key;
      const pages = key && KEY_PAGES[key];
      if (pages && !pages.includes(currentPage)) return;
      clearTimeout(_syncDebounce);
      _syncDebounce = setTimeout(() => {
        const s = getSession();
        if (s && s.profileSetupDone && s.roles && s.roles.length) {
          renderPage(s);
        }
      }, 500);
    });

    // Handle foreground push notifications — show in-app toast
    window.addEventListener('push-notification', (e) => {
      const { title, body } = e.detail;
      _showPushToast(title, body);
    });

    // Handle push deep-link navigation
    window.addEventListener('push-navigate', (e) => {
      const type = e.detail.type;
      const page = e.detail.page;
      const s = getSession();
      if (!s) return;

      // If the notification includes a specific page, use it directly
      if (page) {
        if (page === 'match-detail' && e.detail.matchId) {
          detailMatchId = Number(e.detail.matchId);
        }
        currentPage = page;
      } else {
        // Fallback: map notification type to page
        if (type === 'convocatoria') {
          const matchId = e.detail.matchId;
          if (matchId) { detailMatchId = Number(matchId); currentPage = 'match-detail'; }
          else { currentPage = 'convocatoria'; }
        } else if (type === 'training_reminder' || type === 'match_avail_reminder') {
          currentPage = 'player-home';
        } else if (type === 'rpe_reminder') {
          currentPage = 'player-actions';
        }
      }
      renderPage(s);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
  // #endregion Init & Bootstrap
})();
