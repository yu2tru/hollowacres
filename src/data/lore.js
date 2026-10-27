// Mystery documents. `at` names a fixture or landmark where the entry is found.
// `reveals` unlocks bestiary entries; `unlocks` gameplay content.
export const LORE = {
  realtor: {
    at: 'table', title: 'Letter from the realtor', day: 1,
    text: `Welcome to Hollow Acres!

The paperwork is filed and the place is yours, house, barn, the south field and the old generator out by the shed. I've left the previous owner's spare fuel in the tank.

A couple of things the estate asked me to pass on, which I am passing on without comment: keep the yard lights on after dark, and don't leave anything in the field you aren't prepared to lose.

Supplies can be ordered from the laptop on the desk. Hollis Feed & Supply delivers same day, 6 AM to 8 PM.

Best of luck,
Dana Whitcomb, Whitcomb Realty`,
  },
  drawer: {
    at: 'drawer', title: 'Note in the drawer', reveals: ['pale'],
    text: `To whoever comes after.

The revolver was my father's. It will not kill the tall one but it will make him go back to the trees for a while, and a while is all you need until morning.

Keep the lights burning. He does not walk into the light. He does not move while you are looking at him. When you cannot see him, assume he is closer.

E. Hollis, October 1961`,
  },
  ledger: {
    at: 'ledgerCrate', title: 'Hollis harvest ledger', reveals: ['gnawer'],
    text: `HOLLIS FARM - HARVEST & ACCOUNTS (excerpt)

1939  wheat 410 bu.  potatoes 6 t.   tithe: 41 bu. to the stone
1946  corn 900 bu.   pumpkins 210    tithe: 90 bu. / 21 pumpkins
1955  corn 1,140 bu. pumpkins 260    tithe: 114 bu. / 26 pumpkins
1960  corn 1,310 bu. pumpkins 300    tithe: paid late. Fields chewed to the root along the west fence.
1961  corn 1,480 bu.                 tithe: NONE. To hell with Coyle and his stone.

(margin, pencil) The little ones come for the crop first. They won't feed near a scarecrow or under a lamp unless they're many. A trap breaks their backs.`,
  },
  cabin: {
    at: 'cabin', title: 'Pages from Martha Hollis\' diary',
    text: `Sept 30 1962
Elias pulled the stakes last spring and sold them to the scrap man in Corran for eleven dollars. He says the stone is a rock and Coyle was a crook. Every night since there is something new.

Oct 9
There is a man in the corn. He is too tall for a man. When I look at him he is still. When I look away and back he is nearer. I sat on the porch with the lamp and the shotgun until dawn and he did not come into the lamplight. He went back to the trees when the sky turned grey.

Oct 14
The people from the road came again. Some of them I knew.

Oct 15
Elias says we are leaving after harvest. I don't think they will let us take it with us.`,
  },
  chapel: {
    at: 'chapel', title: 'Parish book of Rev. Abner Coyle', reveals: ['hollow'], unlocks: ['chimes'],
    text: `HOLLOWAY PARISH, 1891

The blight took the second planting. Forty souls will not see spring on what is left.

I have been to the stone in the north woods and I have spoken with what answered. It is old and it is patient and it does not want our souls, only a share. A tenth of all that grows on this land, left at the stone at harvest, and the land will give as it has never given.

We drove four stakes of cold iron at the corners to mark what is ours and what is theirs. Iron they cannot cross; iron they cannot quench. The children hang iron chimes on the porches and the dark things keep off.

Should the covenant be broken, I am told they will come to collect it themselves, and they will take more than a tenth.

The covenant may be closed. But all that is owed comes due in one night.`,
  },
  oldwell: {
    at: 'oldwell', title: 'Sheriff\'s report, 1974', reveals: ['drifter'], reward: { parts: 4, ammo38: 12 },
    text: `CORRAN COUNTY SHERIFF - INCIDENT REPORT  #74-0311

Subject property: former Hollis farm, leased 1972 to the PRUITT family (Ray, Lorraine, two minors).

Deputy Hale responded to a call from the neighbouring Pruitt brother reporting the family missing. House found with all lamps burning, generator dry, front door broken in from outside. Livestock gone. No bodies.

Deputy Hale reports seeing "five or six persons" walking in the tree line at dusk who did not answer when called. He described one as wearing a woman's church dress "like something out of the forties".

Recommend no further action. File closed.

(handwritten) They go for the lamps and the engine, then the door. - H.`,
  },
  survey: {
    at: 'survey', title: 'County surveyor\'s field notes, 1959', revealsStakes: true,
    text: `CORRAN COUNTY SURVEY - HOLLIS TRACT, re-survey for tax purposes

Original 1891 corners are marked by stone posts, each drilled for an iron stake. Corners located: N, E, S, W - see sketch. Stakes present in 1959 but loose in their sockets.

Odd thing: the tree line follows the corners almost exactly, as if the woods were planted to the boundary. The Hollis man says nothing grows wrong inside the line.

(Sketch shows four stones at roughly north, east, south and west of the farm, well into the trees.)`,
  },
  stone: {
    at: 'stone', title: 'The Tithe Stone',
    text: `Words cut into the stone, worn almost smooth:

WHAT GROWS WITHIN IS YOURS
A TENTH IS OURS
BREAK THE LINE AND WE WILL TAKE OUR SHARE

Tucked into a crack, in a plastic bag, a note in Elias Hollis' handwriting:

"Coyle's book says it can be closed. Drive all four stakes home again, then bring the first fruit of the land to the stone and break it open here. Then they come for everything that is owed, all at once, in one night. If you are still standing at dawn, the line holds forever.

I was not brave enough. Maybe you are."`,
  },
  letter_dale: {
    mail: 2, title: 'Letter from Dale Pruitt', reveals: ['antlered'],
    text: `Neighbor,

Saw your lights from the county road. Figured someone ought to tell you, since nobody told my uncle Ray.

If something big comes out of the trees with antlers like a dead oak, it is after your machinery and your fences, not you. It runs straight and it can't turn worth a damn. Get out of its line. Shotgun to the head when it's dazed.

There's old papers out at the Hollis cabin west of the pond and at the chapel in the north woods. Read them. Ray didn't.

- Dale Pruitt, County Rd 9`,
  },
  letter_county: {
    mail: 4, title: 'County Extension notice',
    text: `CORRAN COUNTY AGRICULTURAL EXTENSION

Market notice: buyers in Corran are posting delivery contracts on the Feed & Supply site. Contracts pay above market for timely delivery.

Weather: the autumn pattern brings fog in the hollows and storms off the ridge. Rain will water your fields for you. Storms knock out lines; check your generators.

Reminder: livestock losses to "wild dogs" should be reported to the Sheriff's office.`,
  },
  letter_dana: {
    mail: 6, title: 'Letter from Whitcomb Realty',
    text: `Hello again!

I have a buyer interested in the Hollis tract, cash, as-is. I'd recommend considering it. The last three owners all sold within a month. One didn't sell so much as stop answering the phone.

The buyer would like the property vacated before the first frost. They were very particular about the date.

Dana`,
  },
};

export const STAKES = ['stake_n', 'stake_e', 'stake_s', 'stake_w'];
