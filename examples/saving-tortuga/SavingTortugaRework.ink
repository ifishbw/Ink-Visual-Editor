// Saving Tortuga — reworked copy of SavingTortugaMain.ink
//
// Structural notes (the visual editor keeps knots as separate nodes, so
// file order is not important):
//
//   Tunnels  — conversations and minigames end with ->-> so the caller
//              decides where to resume. Call them with  -> knot ->
//   Nested   — priest topics are tunnels inside the priest tunnel; the
//              priest knot pops back to the square if a topic ends the visit
//   Shared   — both voyages spend a day the same way (gamble / chat / bored)
//   LISTs    — inventory and knowledge replace the old boolean pile
//
// Player-facing text is kept from the original. One logic fix: murdered
// starts false, so the hill ending can actually branch.

LIST Inventory = scripture, stocks_key, smuggling_crate, sword
LIST Intel = jon_to_docks, jon_with_smuggler, prisoner_interrogated, prisoner_freed, key_from_asking, banned_priest, priest_shown_evi

VAR money = 10
VAR bet = 0
VAR murdered = false


When Ever you See O-^ this means you aquired an item or information that opens new choices somewhere.
* [Start] -> Exposition

=== Exposition
Sitting in the rugged old in , you can't help but re-read the letter that brought you here.

Deacon Morgan We are your assistance of a task, Jon the one who fought along side your late father in establishing the new parishes over in the west Talamor sea. He has recieved a message from a message from an angel and has been put on a quest that is leading him to the pirate fort of Tortuga. He hasn't disclosed much only saying God is going to save those heathen pirates. Regardless make your way to Havton where Jon will meet up with you outside the end where a escort vessel has been charted for you.
You fall asleep to the sound of the waves crashing, as you ponder what this quest might possibly involve and what Jon might mean by saving the Pirates.
In the morning you wake up put on your blue trench coat and step outside the Inn in the dirt street of Havton.
-> Outside_Inn

=== Outside_Inn
You are standing outside the Inn {with no sign of Jon.|}
+ [Wait]
    -> wait -> Outside_Inn
+ [Go to the town square] -> Town_Square_Intro

=== wait
{You stand around for a while and don't see Jon|Again there is no sign of Jon|Jon's not here, you start thinking to yourself maybe he is waiting in the town square or already headed to the boat}
->->

=== Town_Square_Intro
The town square is about what you expected from a port town, some shopping stalls, , Taverns, palm trees swaying in the ocean breeze, sailors heading out to the docks, some sketchy back alleys, and of course the humble temple at one end and the town hall at the other.
You also see what looks like a pirate being thrown in the stocks by one of the holy guards at the command of a priest.
-> Town_Square

=== Town_Square
A nice square in the town.
+ {not knows(prisoner_freed)} [Talk to prisoner]
    -> prisoner -> Town_Square
+ {not knows(banned_priest)} [Talk to priest]
    -> priest -> Town_Square
* [Look for Jon near the square]
    -> look_for_jon -> Town_Square
+ [Go to docks] -> docks
+ [Return to inn] -> inn

=== look_for_jon
You look around the town square for any clues of Jon
Asking around no one seems to have seen him this morning
But you do spot a book on the road leading to the docks.
After closer inspection appears to be Jon's holy scripture that must of fell out of his bag.
O-^
~ take(scripture)
~ learn(jon_to_docks)
->->

=== prisoner
{"Screw that priest all there holiness They have no evidence for anything all I did was help out loading a boat"|}
"What do you want{are you here just to mock me|}?"
+ {knows(jon_to_docks) && not knows(prisoner_interrogated)} [Ask If he saw Jon at the Docks]
    "Why would I tell ye anything about Yester Night? You got no evidence and nothing to Offer me"
    ++ {has(smuggling_crate)} [show smuggling evidence]
        "Well how was I supposed to know They were smuggling"
        "I was only loading their ship, and yes it was the middle of the night I but if you want to know about that Jon guy yeah I saw him leave on that ship heading west"
        O-^
        ~ learn(jon_with_smuggler)
        ~ learn(prisoner_interrogated)
        ->->
    ++ {has(stocks_key)} [Offer to free him]
        "Yes, Yes I saw that Jon prophet guy get on a boat, let me out and I'll tell you everything I know about the boat." 
        *** [Let him free]
            "Oh Thank you yeah that Jon guy in the middle of the night went and offered a good sum of coin for them to take him as far west as he can"
            O-^
            "A holy decon like you is the last person I though would let me out of those stocks"
            ~ learn(jon_with_smuggler)
            ~ learn(prisoner_freed)
            ->->
        +++ [Nah]
            He proceeds to spit on your leather boots.
            ->->
    ++ [Well I don't know]
        ->->
+ {has(stocks_key)} [Free him]
    "Oh thank you"
    {knows(prisoner_interrogated):
        " Oh thanks at least I got something out of this"
        ~ learn(prisoner_freed)
        ->->
    - else:
        "You holy people have been acting very strange lately"
        "you know I saw a guy his name Was Jon or Josh but he left on that boat last night heading towards the port to the west, Decima I believe"
        O-^
        " I never thought I would see A priest sailing with a crew like that."
        at that you see him scurry away into the back alleyy around the tavern.
        ~ learn(jon_with_smuggler)
        ~ learn(prisoner_freed)
        ->->
    }
+ [Leave Him Be] ->->
-> priest

=== priest
-> first_meeting ->
"Is Their anything{| else} you want to discuss"
- (opts)
* [Jon is Missing]
    "Quite odd that is, I would reccomend trying to find where he has gone he was the one choosen for the mission, when you do find him your ship is ready to leave"
    -> opts
* [Ask about the Prisioner]
    -> ask_prisoner -> opts
* {has(smuggling_crate)} [Show Evidence of smuggling]
    -> provide_evi ->
    {knows(banned_priest): ->->}
    -> opts
+ {not has(stocks_key) && TURNS_SINCE(-> ask_prisoner) != -1} [Ask to release prisoner]
    -> ask_for_key ->
    {has(stocks_key): ->->}
    -> opts
+ {not has(stocks_key) && TURNS_SINCE(-> ask_prisoner) != -1} [Steal keys to the stocks]
    -> steal_keys ->
    {has(stocks_key): ->->}
    -> opts
+ [Return to the Town Square] ->->

=== first_meeting
{first_meeting == 1:
You walking Over to the Priests office attached to the temple.
The priest is slender man, cleanly shaven, well groomed you reckon he's in his late 30's. he is wearing a the deep blue priestly robes.
looking up from his papers he extends his hand, "Greeting I'm Father Fredrick, you're the decon sent to assist Jon on his tortuga mission I presume"
}
->->

=== ask_prisoner
"Well he was hanging around the docks early this morning I suspect he was involed in helping smuggling, it's just the thing a scoundral like him would do."
->->

=== provide_evi
~ learn(priest_shown_evi)
{knows(key_from_asking):
    "Well it's no use now freeded him, get out of my office see this is why you don't trust those heathen"
    ~ learn(banned_priest)
    ->->
- else:
    "Well good then I'm sure you could use this information against him"
    ->->
}

=== ask_for_key
{TURNS_SINCE(-> provide_evi) != -1:
    "No you gave me the evidence proving he was smuggling"
    ->->
}
"no he is clearly a Pirate I am going to keep him locked up unless you can show me some scripture that says otherwise."
You know that the laws clearly state he needs evidence or witnesses,
{has(scripture):Luckily you picked up Jon's copy of scripture | but sadly you don't have your own copy to prove it. }
+ {has(scripture)} [Show The scripture and get keys]
    You pull out the scripture and after a couple minutes of flipping around you find the passage about needing witnesses.
    "hmmph very well take the keys and you can go let him free"
    o-^
    ~ learn(key_from_asking)
    ~ take(stocks_key)
    ->->
+ ->->

=== steal_keys
{RANDOM(1, 4) == 1:
    -> steal_success ->
- else:
    -> steal_fail ->
}
->->

=== steal_success
You found a Oppurtunity to Snag the Keys while he was looking away.
o-^
~ take(stocks_key)
->->

=== steal_fail
You Try to Find an oppurtunity To Snag the Keys from the priest but are unable to find an oppurtunity.
After a couple of akward moments of silence of you standing around trying to look natural he says.
"What are you doing? is their something you need?"
* [No]
    No, no I am simply admiring your office.
    The Priest seems a little confused by this as the office is quite bare with little more than a desk and a chair.
    ->->
* [Yes about those keys.]
    -> ask_for_key ->
    ->->
+ ->->

=== docks
You are at the docks
{You see some dock workers walking around as well as the boat that was chartered for you and Jon to Tortuga.|}
+ [Go to your Chartered Boat]
    -> YourBoat -> docks
+ [Investigate docks]
    -> investigate_docks -> docks
+ [Talk to dock worker]
    -> dock_worker -> docks
+ [Back to town square] -> Town_Square

=== YourBoat
The Captian greets you as you approach "We are all ready for you and Jon and can leave whenever your ready."
+ [About Jon]
    "Oh what about Him"
    ** {not knows(jon_with_smuggler)} [Has he already gotten on board?]
        "No he hasn't arrived yet. I've been waiting all morning maybe check around I'm sure he's around"
        ->->
    ++ {knows(jon_with_smuggler)} [He left already on a smuggler ship]
        "well odd I can't think of a reason why he would have done such a thing."
        "Sounds like you can either wait a day or 2 and see if he return or if your so inclide we can leave without him"
        *** [Leave With out Jon To Tortuga]
            "very well come aboard and we will set off"
            -> leave_without_jon
        +++ {knows(jon_with_smuggler)} [Head after the Smuggler Ship]
            "Ah a chase I see but decima is a much farther distance than Tortuga we will have to stock up extra supplies. You can come back in the morning and we can set sail."
            ->->
    ++ [Nothing]
        ->->
+ [Inist on Leaving Now]
    "Ok I don't feel comfortable about leaving Jon but if you insist"
    ** [Sail to Tortuga]
        "Ok very well then we shall set off at once"
        -> leave_without_jon
    ++ {knows(jon_with_smuggler)} [Head after the Smuggler Ship]
        "Ah a chase I see but that's a much farther distance than tortuga we will have to stock up on supplies and you can come back in the morning."
        ->->
    ++ [Nevermind]
        "Very well then"
        ->->
+ [Nevermind]
    ->->

=== dock_worker
Well anything you want to know?
- (opts)
* [ask If he's seen Jon]
    "You talking about that guy in the blue robe, always going on about how the priesthood is so rightrous. That guy?"
    ** [Yeah him]
        "Oh no haven't not since yesterday"
        -> opts
    ** [No don't think thats him]
        "well I don't know any others who go by Jon"
        -> opts
* [Ask if anyone left last night]
    He says only a single ship left last night, and only the guy who knows who was on it was thrown in the stocks.
    -> opts
* [ Ask about the prisioner]
    "Him loading up that ship last night, I'm not saying he is a smuggler but why else would anyone try to load a ship up in the dead of night.
    -> opts
+ [Nevermind] ->->

=== investigate_docks
You Find no evidence of Jon on the docks, but while you are looking you see a crate of illegal firearms in the water next to the docks. Clearly some smuggling has gone oh here.
O-^
~ take(smuggling_crate)
->->

=== leave_without_jon
You leave for Tortuga on the ship — a three-day journey.
-> sailing_holy

=== inn
You return to the inn — still no Jon.
+ [Wait till tomorrow] -> storm
+ [Explore more of town] -> Town_Square

=== storm
As you are sleeping there is a terrible tropical storm during the night quite possibly the worse you have seen shaking the whole room. Luckily the worst of the storm was to the west. After a couple hours of being kept up by the storm it ceased up and allowed you to go backt to sleep in peace.
-> morning

=== morning
In the morning you hear a big commotion happening in the town square.
You walk out witnessing the scene.
Father Fredrick out in his sleeping robes standing cross armed in front of the temple entry lecturing angerly down at a crew of sopping wet disheveled pirates standing at the bottom of the temple steps. Fredrick saying. "No, Your no allowed into the temple you heathens, I ought to go get the holy guard and throw you out for smuggling"
    {knows(priest_shown_evi):
        "I've been shown the evidence" he then notices you points "Deacon Morgan over their found a crate of weapons you dropped in the port last night."
    - else:
        "I caught one of your helpers loading your ship"
    }
    "Now why Would I let you in"
    Shocked in expression the crew. The better dressed of the crew presumably the captian took his hat off and held in on his chest saying "yer holiness yester night we were caught up in that storm bound to die miraculously saved by the God that this Jon fellow Worships. Is this not the temple to worship Jons God?"
    Father Fredrick retorted "Yes it is indeed but if it is Jon who intervined to save you where is he now?"
    "Uhhhh well ye see it's a bit of mess, ughh" the captain pauses scratching his head "well he was cast overboard during the storm, it's along story"
    "no I have heard enough" the priest interjects "now I'm certain I'm not letting you in, goodbye" as the priest slams the doors."
    The pirate crew turns to each other quietly discussing what to do.

+ [Go talk to the pirate captain] -> side_with_pirates
+ [Go talk to the priest] -> side_with_priest

=== side_with_pirates
"Ahoy, I presume ye a deacon then what yer have to say to thee"
-> questions
= questions
* [Ignore the Priest he hates pirates]
    "Glad it we know little of your Gods but clearly he is greater than ours. but I also don't blame him are bunch have been known to be a menance to folks of your order"
    -> questions
+ [Jon is he DEAD?]
    "We reckon as much it's a long story but short end of it is he ask us to do it"
    "He mentioned he was supposed to be on a quest off to tortuga It clearly was a important mission to warrant such wrath"
    "how about we take ye to tortuga to fulfill the quest we can tell you the long story on the way."
    ** [Sounds like a plan]
        "Let us depart crew go ready the ship"
        -> ship_with_pirates
    ** [No I already have a boat charted for me]
        -> holy_boat
    ** {TURNS_SINCE(-> side_with_priest) == -1} [No I have to talk to the priest]
        -> side_with_priest

=== side_with_priest
You follow father Fredrick into the temple
"Damn those pirates they might as well have killed Jon"
"It aprears you will have to go and fulfill his mission without him"
-> questions
= questions
* [You should let them into the temple]
    "I appreciate your compassion for them but they are heathen they worship lesser Gods and God only who know what other evils they have committed."
    -> questions
* [Set off at once to tortuga]
    -> holy_boat
+ [Leave and talk to the Pirate Captain]
    -> side_with_pirates.questions

=== ship_with_pirates
You walk aboard the little pirate vessel with the crew running around perparing the ship for sailing. "Welcome aboard ye matey make yer self comfortable it's 3 days of sailing to make it out to tortuga. You take the captains quarters for ye self"
You go set your stuff down and roughly an hour you are out on the open ocean.
After a bit you get a bit bored and want to go do something.
-> spend_a_day(true) ->
Another day on ship all the pirates seem to be quieter and more somber than what you reckoned a pirate crew would be like then again they still drank as much as you expected them to. But what else was there to do other than sit around.
-> spend_a_day(true) ->
It was just as quiet as it was yesterday but you found something interesting to look at from the crows nest you spotted a barrel floating in the ocean. looking at it with a spyglass it appeared a monkey was standing standing on the edge rowing with it's hands. You kept thinking it was just the sun and heat making you go mad but it didn't go away.
You then returned back to your hammock with the rest of the day being uneventful. The next Day tortuga is in sight coming closer as you sail to the back side.
A short row over to the beach the captain says "Well Good luck and God speed on your quest we'll be keeping the ship here until you return and here's a set of more unassuming clothes pirate lord won't take to kindly to your deacon coats. Just follow the beach to the right and you'll get to tortuga in no time."
-> broken_barrel

=== holy_boat
-> sailing_holy

=== sailing_holy
You clamber on board the nice little sloop equipped with a couple cannons a rowboat and a upright crew.
"You got a hammock over with the crew the journey will take about 3 days of sailing so might as well get comfortable." The captain tells you before setting off.
Now sailing on the open ocean with the salty see ocean and havton fading over the horizion you decide to find something to do.
-> spend_a_day(false) ->
-> storm_on_boat ->
The next morning the scenery looks about the same clear blue sky's a and the blue ocean with nothing on the horizion. You sit around admiring it.
Though you got bored and want to do something
-> spend_a_day(false) ->
On the third day, you're very tired and supposedly tommorrow you will make it to tortuga. You spend the day mostly in your hammock reading a book the captain let you borrow. In the evening you were interrupted when the crewmate yelled.
"Hey captain I see something you might want to check out, it looks like a barrel floating out their" curious you follow.
"I spotted a floating barrel over on the horizion you think we should sail over and check it out?"
"Hmmm well what do you think?" as the captain turns to you.
+ [Sail to it] -> sail_to_it
+ [Ignore the barrel] -> ignore_barrel

=== spend_a_day(on_pirate_ship)
- (what_to_do)
+ [Go gamble with {on_pirate_ship:the pirates|the crew}]
    {money <= 0:
        But you realized you don't have any money so you decide to do something else.
        -> what_to_do
    - else:
        You go and sit down with several crewmates on their break rolling some dice.
        -> crown_and_anchor(on_pirate_ship) ->
        ->->
    }
+ {on_pirate_ship} [Chat up the pirate captian]
    -> ask_pirates_about_tortuga ->
    ->->
+ {not on_pirate_ship} [Go chat with the captain about Tortuga and mission]
    -> Captain_Chat ->
    ->->
+ [Sit and be bored]
    -> bored_at_sea(on_pirate_ship) ->
    ->->

=== bored_at_sea(on_pirate_ship)
{on_pirate_ship:
    -> pirate_bored ->
- else:
    -> holy_bored ->
}
->->

=== pirate_bored
{ stopping:
    - You start just laying on the deck staring up into the sky as the crew walks around you
        You start to ponder on the meaning of life and what it all means
        Why am I here.
        Why did God create all this.
        Can God really forgive all these Pirate
        Why do all these pirates like piracy
        Why do they smell so bad.
    - It really was boring sitting around on a boat with nothing to do.
        But looking on the horizion you reckon your looking at an ISLAND!
        EXCITED you stand up and quickly spider up to the crows nest to see.
        It was nothing.
        You then continued to be bored the rest of the day.
}
->->

=== holy_bored
{ stopping:
    - You start just laying on the deck staring up into the sky as the crew walks around you
        You start to ponder on the meaning of life and what it all means
        Why am I here.
        Why did God create all this.
        Why does God allow men to be so evil.
        And...
        You snap out of it as bird poop plops down on your coat from the masts above.
    - It really was boring sitting around on a boat with nothing to do.
        But looking on the horizion you reckon your looking at an ISLAND!
        EXCITED you stand up and quickly spider up to the crows nest to see.
        It was nothing.
        You then continued to be bored the rest of the day.
}
->->

=== storm_on_boat
During that first night you where waken by a crack of lightning as you realizing the swaying of the ship was so violent the floor hardely felt flat. Stubling around the tosed ship you poke your head out of the cabin to see walls of water crashing upon the deck with the crew holding on for dear life.
"Get back in side, this we'll just have to ride this storm out", yelled the Captain after seeing you.
At this point you return to your hammock and anxiously wait and praying for the passing. Not long after the storm seemed to ceased up in matter minutes returning to a gentle rocking and sprinkle.
Soon the captain walking through saying "Thank the almighty if we had been any farther west I would say God was smiting us, anways get some sleep"
->->

=== crown_and_anchor(piratess)
"We are gonna play Anchors and Crowns gonna place bet on a side of this die, and then role these 3 dice if you want to get matches one match you get your coin back, 2 you get double your coin and 3 match you get triple I'll even throw in a sword I got."
~ temp call = 0
~ temp current_rolls = 0

- (start)
~ call = 0

"What {piratess:Ye |are you } gonna bet on"
+ [{die_symbol(1)}]
    ~ call = 1
+ [{die_symbol(2)}]
    ~ call = 2
+ [{die_symbol(3)}]
    ~ call = 3
+ [{die_symbol(4)}]
    ~ call = 4
+ [{die_symbol(5)}]
    ~ call = 5
+ [{die_symbol(6)}]
    ~ call = 6

- "Ok {piratess:yar | you're } betting on {die_symbol(call)}s. How much {piratess:Ye betting? |do you want to bet? } "
You to have {money} coins
+ {money >= 1} [1]
    ~ placebet(1)
+ {money >= 2} [2]
    ~ placebet(2)
+ {money >= 5} [5]
    ~ placebet(5)
+ {money > 1} [All of it!]
    ~ placebet(money)
- (Roll)
~ current_rolls = 0
- "Ok you're betting {bet} coin on {die_symbol(call)}s, Let's Roll"
~ current_rolls = rolldie(current_rolls, call)
<>
~ current_rolls = rolldie(current_rolls, call)
<>
~ current_rolls = rolldie(current_rolls, call)
{current_rolls:
    - 0: Sorry mate but bad luck
    - 1: Well you broke even
        ~ money += bet
    - 2: Cograts you made a bit of money heres your {bet + bet} coins
        ~ money += bet + bet
    - 3: What a lucky roll Jackpot, {bet + bet + bet} coins.
        {not has(sword):
            Heres my sword as promised"
            O-^
            ~ take(sword)
        }
        ~ money += bet + bet + bet
}
You now have {money} coins
+ {money > 0} [Want to play again]
    -> start
+ {money > bet} [Roll gain same bet]
    ~ placebet(bet)
    -> Roll
+ [I'll leave it at that]
    ->->

=== function has(item)
    ~ return Inventory ? item

=== function knows(fact)
    ~ return Intel ? fact

=== function take(item)
    ~ Inventory += item

=== function learn(fact)
    ~ Intel += fact

=== function rolldie(current_rolls, call)
    ~ temp die1 = RANDOM(1, 7)
    // give player advatage its fun
    {die1 == 7:
        {die_symbol(call)}, <>
        ~ current_rolls += 1
        ~ return current_rolls
    }
    {die_symbol(die1)}, <>
    {die1 == call:
        ~ current_rolls += 1
    }
    ~ return current_rolls

=== function placebet(amount)
    ~ money -= amount
    ~ bet = amount
    ~ return

=== function die_symbol(die)
    {die:
    - 1: Crown
    - 2: Anchor
    - 3: Heart
    - 4: Diamond
    - 5: Spade
    - 6: Club
    }

=== ask_pirates_about_tortuga
"Yar what ye got any concerns
* Wondering about tortuga
    "Well it's ye biggest pirate Fortress in all of the Talamor sea's, all the scoudrals and smuggler's and rotten old pirates head there it's got a fort and the towns tucked up some mountains. Plenty of Debachuary and you don't want to go messing about with the pirate lord."
    ** Will the pirates let me into tortuga
        "I reckon you might have to swap out out your holy blue outfit for something more unassuming, and I already plan to land on the opposite side of the island. Got some gold cache away so we can later replenish the supplies we lost in the storm"
    ** About the pirate lord.
        "A crooked old villain, used to go by the name Skeletim, his ships plundered many more than me and my crew or any for that matter even won some big battles against the holy navy"
        As you here that you realised that this pirate lord must have been the pirate that killed your father.
    -- "what's your quest to tortuga all about anyhow Jon said something about saving tortuga"
    ** Don't know much more than you but God will guide me
        "That's not very useful I was hope you could give me some guidance I may very well be in the same boat as those in Tortuga."
    ** I assume calling the pirates to repent so they won't get smited
        "Well you mind giving me a head start I reckon your God's not happy with me or all the blood split and illicit goods transported"
    -- "Got advice"
    ** Stop being pirates is a good start
        "Yar, I guess that be true"
    ** {has(scripture)} Here is a book to tell you
        "ah yes a holy scripture wonderful don't really read but what I saw during that storm I believe it"
* What happened to Jon during that storm
    Well during that powerful storm, I'm sure the island was hit by some of it, the shipp was tossed about more than any storm I have seen on the seven sea's. We through all our cargo over board in desperation to keep the boat afloat.
    Me and all our crew decided one of our god's must be smiting us.
    I Told the crew pray to your gods
    Jon who somehow was sound alseep, we Shook him saying
    ARE YOU CRAZY how are you sleeping at a time like this wake up and pray to your gods and maybe they spare us.
    He calmly stated my God gives me peace and he is the Creator of the universe and heavens and the earth and the seas.
    WHAT have you done for your God must be smiting us all.
    He explained God told him to go to tortuga and he was running away and that this was his fault.
    He told us to throw him overboard and the storm will cease.
    So we did casting him overboard. As he said the storm ceased into little more than a sprinkle moments later. Thats when we knew his God must be greater than all of ours.
    well that's the story"
    ->->
- "Good talking but this ship won't captain it's self"
->->

=== Captain_Chat
"What's on your mind deacon morgan"
- (ask_cap)
* Wondering about tortuga
    "Well it's the biggest pirate Fortress in all of the Talamor sea's, I can't say I have been their myself"
    "... But I hear they're a big old rotten bunch over there gambling, drinking, and commiting all sorts of sinns"
    "Kinda Deserve some divine wrath if you ask me"
    -- (ask_tort)
    ** Do you know why were trying to save them
        "Well I can't tell, I thought you ought to be the one who know that stuff it's your mission now with Jon gone,"
        *** It's just my Quest
        *** Maybe the pirates will repent
            "That would be something, I can't imagine"
        --- -> ask_tort
    ** Will the pirates let me into tortuga
        "I reckon you might have to swap out out your holy blue outfit for something more unassuming, and I already plan to land on the opposite side of the island, Since this is still a military vessel. But you should be fine"
    -- "Oh, another thing you should know the pirate lord there he killed your father back in a battle when we fought over these lands"
* What did you know about Jon
    "Well he is or well ...maybe I should say was a great leader leading several ships and protecting our towns, ambassador ships, and temples all over the talamor sea."
    "Your father captianed one of the ships he lead{ask_cap:, well until your father died in battle with the pirate lord of tortuga}."
    ** {knows(jon_with_smuggler)} Why do you think Jon just left
        "I keep pondering that, a pretiged sailor spending so much time fighting pirates just to leave on a ship with a bunch of them."
    ** What was Jon like
        "A very upright man did everything to the law. never say him break any rules, and didn't take kindly to though who broke rules, Reckon thats the reason he hated pirates so much."
- "Good talking but this ship won't captain it's self"
->->

=== ignore_barrel
"very well it might have just been a waste of time"
You then return back to your reading with the rest of the day being uneventful. The next Day tortuga is in sight coming closer as you sail to the back side.
A short row over to the beach the captain says "Well Good luck and God speed on your quest we'll be keeping the ship here until you return and here's a set of more unassuming clothes most pirates don't like our type. Just follow the beach to the right and you'll get to tortuga in no time."
-> broken_barrel

=== sail_to_it
The captain guides the ship over to it as it get's closer you start to be able to see what it is.
You can make out a monkey that's rowing.
Right as you get up to it you look in and see the the sun baked face of Jon.
"It's Jon get him out" the captain yells to the crew.
As they pull the barrel onboard the monkey jumps out to go hide or harass the cooks for food. Leaving behind the very distraught Jon who looked dehydrated. You pull him out and bring him to the captains quarters bed.
"It's an absloute miracle we found him he must of fell off {knows(jon_with_smuggler): during the storm| some boat he left on} and then was saved by this monkey in a barrel truly a miracle."
"for now let's let him sleep and get rest."
-> jump_out

=== jump_out
The next morning about the time the ship was set to arrive on tortuga you go to check on Jon and find him missing again. Just as you go to see if he had gotten up and was elsewhere on the ship you hear the sound of the row boat dropping into the water as Jon started rowing ahead of the boat towards tortuga which was now only a half a mile away.
+ [Jump out and swim after him] -> swimm_after
+ [Stay on the boat] -> stay_on_boat

=== swimm_after
You jump out in a big splash still wearing your fancy trench coat and start paddling after Jon. Jon keeps angerly mumbling to himself about pirates When he sees you he calls out "don't worry God will save you just like these pirates apparently" that last part he said very angerly. The monkey was watching you from the back of the boat. You ditch your coat and keep trying swim to catch up with no success. The waves soon start overwhelming you. Your conciousness fades out. Next thing you know your on the beach with the monkey dragging you. The monkey runs off as it realises your wake.
You seem to have no other option now but to walk into tortuga.
-> hike_into_tortuga

=== stay_on_boat
Jon pulls away in the row boat towards the port. As your sloop pulls around the island.
The captain came up and said "Well Good luck and God speed on your quest we'll be keeping the ship here until you return and here's a set of more unassuming clothes most pirates don't like our type. Just follow the beach to the right and you'll get to tortuga in no time."
You jump out and after a short swim since the row boat was gone you hike along the beach.
-> hike_into_tortuga

=== broken_barrel
As you hike along the beach you come across the remenants of a barrel presumably the one you saw previously .
* look and examine it
    Upon looking at it you notice there is a whole block of text craved into the inside of the barrel. It read:
    In my distress I called to the Lord,
        and he answered me.
    From deep in the realm of the dead I called for help,
        and you listened to my cry.
    You hurled me into the depths,
        into the very heart of the seas,
        and the currents swirled about me;
    But you, Lord my God,
        brought my life up from the pit.

    “When my life was ebbing away,
        I remembered you, Lord,
    and my prayer rose to you,
        to your holy temple.

    Those heathens who cling to worthless idols
        turn away from God’s love for them.
    What I have vowed I will make good.
        I will say, ‘Salvation comes from the Lord.’”

    While you ponder the orgins of this barrel you are interupted by a monkey that throws a bannana at your head and then runs off It hurt a bit.
    ** Eat the Bannana
        Was a tasty snack energizing you for the rest of the hike.
    ** Yell at the monkey.
        The monkey runns off into the jungle taking no notice of your outrage.
* Move on you got a city to save
-
-> hike_into_tortuga

=== hike_into_tortuga
You start appraoching the port and you follow a path into the jungle up the mountain where you believe the main part of the town resides. Your path comes up along side a sizeable stream. Continuing on you keep picking up on a strong smell of booze Odd for this far from the town.
You then realize that the smell was coming from the stream.
* have a little taste of the stream
    You bend over and scoop some up in your hand and after a short swig you can tell for sure that there is some booze in the stream.
* keep walking
- Procceeding on you arrive at the gates of the fort the doors wide open and no gaurds or the like inside.
Walking into the town it's exactly what you though while at the same time not what you though a pirate fort would be like.
-> tortuga

=== tortuga
{You are standing in the square of tortuga a town of presumably thousands but with almost no signs of anyone apart from a couple pirates poking there head out to look at you before going back in. You do see a tavern that catches your eye, as well as a bigger ominous building that must be where the pirate lord is. | You are standing in the square of tortuga}
{pirate_lord:
    Upon returning to the square you notice a angonizing scream coming from a hill nearby the town and looking over instantly reckognizing the deep blue priestly robes of Jon.
}
* [Investigate]
    -> investigate -> tortuga
* [Go to tavern]
    -> tavern -> tortuga
* [Visit pirate lord]
    -> pirate_lord -> tortuga
+ {pirate_lord} [Leave to find Jon] -> find_jon

=== tavern
The tavern is a beat up establishment with a bar and several tables some of which have dice scattered about. One of the tables was covered in empty booze bottle. The only person you saw was a short grey bearded man who walking in through the back door.
"Hey didn't you not hear the decree no more booze says the Pirate Lord" as he says this you see the bartender grab a bottle from behind the bar and walk out the back and pour it into the stream. After dumping out a full bottle of rum walk back inside saying," well if it ain't booze then what do you want."
* What happened here?
    He puts down the bottle and looks up "A crazy prophet came through yelling Repent or the city will be destroyed by the wrath of God and then left"
    "seems like the pirate lord believed it and said no more booze, as much as I think that prophet was crazy that pirate lord is crazy enough to enforce it."
* ughh I was just leaving
-
->->

=== pirate_lord
You walk up and open the doors to the building and walk through the lobby filled with ecentric decoration gold chandelers, master paintings, and gold lying about. You take the grand stair case up to the office of the pirate lord. Still with no one ask questions to or stopping you slowly open the door just a crack at first. Stepping inside the dark room there you see him the legendary pirate lord the most nasty and notorious pirate to ever live, and the the man who killed your father. At first you are really confused as you look upon a shirtless and rather skinny man with a scraggly beard sitting on the floor leaning forward looking out a crack in the curtains almost like how a child would.
    * Are you the pirate lord
        Without turning around "Seemingly yes, whom may it concern"
    * Wait to see if he notices you
        After what feels like a excurciatingly long minute he said "and who are you to come and visit me in my morning"
    -
    * Someone wondering whats going on
        "To anwser it, I am believe in that prophet Jon and I'll obey even if my men hate me for it."
    * (blame) The man who's father you murdered
        "You know that includes a lot of people, even some of my own men, but you don't seem to be.
    * A deacon
        "a friend of Jon then"
    - He turns around and takes a good long look. you can't tell how much he's actually seeing in the darkness.
    Hmmmm "might as well start with him" he says quietly to himself
    {blame:
        "Yes I reckognize you by how much you like your father, you are correct I killed your father."
    - else:
        "I know who your father was I can tell your the son of that holy ship captain I killed those years ago"
    }
    * let him talk
        He goes back to looking out the window.
        "I am sorry, please forgive me for my crimes,"
        "I recently learned the pain that such a crime causes ...I lost a son of mine,"
        "probably the reason I believed Jon I don't want any of my men to die for paying for the wrath that God will bring down on me for my crimes."
    * stop him
    -
    * seek revenge for your father's death
        ** You killed my father prepare to die
            You in a violent passion of rage jump at the pirate <>
            {has(sword):
                pulling the sword you aquired and stabbing the murder in the heart.
                His Face is filled with suprise as he looks down at the blood pouring out he looks up and whispers God forgive me.
                He slumps over onto the ground.
                You now in shock at what you have just done stand up and walk back out to the square.
                ~ murdered = true
            - else:
                punching and wailing on the pirate lord he manages to grapple your arm and get to his feet. You now remeber that this is not some sad old man but is still a dangerous and capable pirate captain. He grabs you throws you out the window crashing into the center of the the tortuga square.
            }
    * I forgive you<>
        , you say
        not knowing what more to do you slowly turn around and walk out and as you are walking down the stairs you hear the pirate sobbing.
    -
    ->->

=== investigate
You see a handful of painted signs stating by decree of the pirate lord No more Piracy, No more Booze, Or law breaking of any kind.
Still almost everyone is in their homes
->->

=== find_jon
You Walk out of town towards the hill you say Jon on perodically hearing "damn you, damn you, damn you to the underworld." being screamed from Jon. You finally approach him on the hill lying on the hill raising his fist against the sky,"Arrgh" he turns to look at you "please kill me I wish I were dead,"
    * {not murdered} Calm down
        He sits up looking out still with a big scowl on his face.
    * {not murdered} What's wrong?
    + -> jon_rants
    - (jon_rants)
    In a whiney voice Jon exclaimed "Why must you leave me cloud you offered me such nice shade," he is clearly goind a little mad.
    * This is about a cloud!
        Yes a cloud
    * Damn you cloud
    - "God is so forgiving isn't he," this shift in tone confuses you.
    He continued "He's a loving and compassionate, he relents from sending calamity,"
    "And thats why I hate God,"
    He then looks up towards the heavens shaking his fist he shouts, "God this is what I told you from the beginning, this is the reason why I fleed to decima these filthy murdering heathen pirates don't deserve grace they deserve your wrath to be poured down upon you." you just stand their in shock not quite know what to do at this revelation.
    * say nothing
        You stand looking at the childish man before you
    * agree
        just as you are about to affirm the statments Jon just Proclaimed <>
    * rebuke
        ** {not murdered} what the hell
            *** God saved you,<>
            after being cast off a ship after you disobeyed, him.
                **** You petty<>
                    , little brat you think your justified in being angry enough to die when a cloud isn't providing you shade.
                    Is God not Justified in giving concern for a city of thousands.
                    Jon looks straight ahead looking off to the horizion being completely defeating in spirit.
    but in the end
    Tortuga was saved.
    The End.
    -> END

        ++ -> jon_ending

    - (jon_ending) A flash of     bright light appeared a man dressing in vibrant white clothes walked up to you and Jon. Clearly he was a heavenly angel. You expected some congratulations on fulfilling your quest.
    But when he opened his mouth he said.
    "You ingrate{murdered:s}" Staring at Jon "God saved you, after being cast off a ship after you disobeyed a direct instruction"
    "You brat, think your justified in being angry when a cloud isn't providing you shade. Is God not Justified in giving concern for a city of thousands."
    "on looks straight ahead looking off to the horizion completely defeating in spirit.
    he wanted to die,
    but in the end
    Tortuga was saved.
    The End.
    -> END


