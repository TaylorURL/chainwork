/**
 * First names a mailbox can be greeted by.
 *
 * Only a person's own address is ever written to, and most of those open with
 * a first name: danny@, maria.g@, jsmith@. A letter that says "Hi Danny" reads
 * as written to him, and one that says "Hi Dfence" reads as a machine that
 * guessed. So a name is taken off an address only where it is a name this list
 * knows, and an address it does not recognise is greeted with nothing after
 * the "Hi", which is how a person writes when they do not know the name.
 *
 * The list is the common run of first names in Southeast Texas, English and
 * Spanish alike, in lowercase. It does not try to be complete: a name it
 * misses costs a greeting, and a word it wrongly holds costs a letter that
 * reads as a guess, so the second kind of mistake is the one to avoid.
 */
const FIRST_NAMES = new Set(
  `
  aaron abby abel abigail abraham adam adrian adriana adrienne aimee al alan albert alberto
  alejandro alex alexa alexander alexis alfred alfredo alice alicia alisha alison allen allison
  alma alyssa amanda amber amelia amy ana andre andrea andres andrew andy angel angela angelica
  angie anita ann anna anne annette annie anthony antonio april araceli ariel arlene armando
  arnold art arthur arturo ashley aubrey audrey austin autumn barbara barry beatrice beatriz becky
  belinda ben benjamin bernard bernice bert beth bethany betty beverly bill billie billy blake
  blanca bob bobby bonnie brad bradley brandi brandon brandy brenda brent brett brian briana
  brianna bridget brittany brooke bruce bryan bryce caitlin caleb calvin cameron candace candice
  carl carla carlos carmen carol carole caroline carolyn carrie casey cassandra cassie catherine
  cathy cecilia cedric celia cesar chad charlene charles charlie charlotte chase chelsea cheryl
  chris christian christie christina christine christopher christy cindy claire clara clarence
  claudia clay clayton clifford clint clinton clyde cody colby cole colin colleen connie connor
  corey cory courtney craig cristina crystal curtis cynthia daisy dale dallas dalton damian damon
  dan dana daniel daniela danielle danny darla darlene darrell darren darryl dave david dawn dean
  deanna debbie deborah debra dee delia denise dennis derek derrick desiree devin devon diana
  diane diego dillon dolores dominic don donald donna dora doris dorothy doug douglas drew duane
  dustin dwayne dwight dylan earl ed eddie edgar edith edna eduardo edward edwin eileen elaine
  eleanor elena eli elias elijah elisa elizabeth ella ellen ellie elliot elmer eloise elsa elsie
  elvia elvira emilio emily emma enrique eric erica erik erika erin ernest ernesto esmeralda
  esperanza esteban esther ethan eugene eva evan evelyn everett ezekiel faith felicia felipe
  felix fernando flora florence floyd frances francisco frank frankie franklin fred freddie
  freddy frederick gabriel gabriela gabrielle gail garrett gary gavin gene geneva genevieve
  geoffrey george georgia gerald geraldine gerardo gilbert gilberto gina ginger gladys glen glenda
  glenn gloria gordon grace graciela grant greg gregg gregory gretchen guadalupe guillermo gus
  gustavo guy gwen hailey haley hank hannah harold harry harvey hazel heather hector heidi helen
  henry herbert herman hilda holly homer hope howard hugh hugo hunter ian ignacio irene iris irma
  isaac isabel isabella isaiah ismael israel ivan jack jackie jaclyn jacob jacqueline jaime jake
  james jamie jan jana jane janet janice janie jared jasmine jason javier jay jean jeanette
  jeanne jeff jeffery jeffrey jenna jennie jennifer jenny jeremiah jeremy jerome jerry jesse
  jessica jessie jesus jill jim jimmie jimmy jo joan joann joanna joanne jodi jody joe joel joey
  john johnny jon jonathan jordan jorge jose josefina joseph josh joshua josie joy joyce juan
  juana juanita judith judy julia julian julie julio june justin kaitlyn kara karen kari karl
  karla kate katelyn katherine kathleen kathryn kathy katie katrina kay kayla keith kelley kelli
  kellie kelly kelsey ken kendall kendra kenneth kenny kent kerry kevin kim kimberly kirk krista
  kristen kristi kristin kristina kristine kristy krystal kurt kyle lacey lance lane larry laura
  lauren laurie lawrence leah lee leo leon leonard leonardo leroy lesley leslie lester leticia
  levi lewis lila lillian lillie lily linda lindsay lindsey lisa liz lloyd logan lois lola
  lonnie loren lorena loretta lori lorraine louis louise lucas lucia lucille lucy luis luke lupe
  luz lydia lynn mabel mack madison mae maggie malcolm mandy manuel marc marcia marco marcos
  marcus margaret margarita margie maria mariah marian marie marilyn mario marion marisa marissa
  marjorie mark marlene marsha marshall martha martin martina marty marvin mary mason mathew matt
  matthew maureen maurice max maxine megan meghan melanie melinda melissa melody melvin mercedes
  meredith micah michael micheal michele michelle miguel mike mildred milton mindy miranda
  miriam misty mitch mitchell molly monica monique morgan moses myra myrtle nadia nancy naomi
  natalie natasha nathan nathaniel neil nelson nick nicholas nicole nina noah noel noemi nora
  norma norman octavio olga olivia omar oscar otis owen pablo pam pamela pat patricia patrick
  patsy patti patty paul paula pauline pearl pedro peggy penny perry pete peter phil philip
  phillip phyllis preston priscilla rachael rachel rafael ralph ramiro ramon ramona randal
  randall randy raquel raul ray raymond rebecca regina reginald rene renee rex rhonda ricardo
  richard rick rickey ricky rigoberto rita rob robert roberta roberto robin robyn rochelle
  rocky rod roderick rodney rodolfo rodrigo roger roland rolando roman ron ronald ronnie rosa
  rosalie rosario rose rosemary rosie ross roxanne roy ruben ruby rudy russell rusty ruth ryan
  sabrina sadie sal sally salvador sam samantha sammy samuel sandra sandy santiago santos sara
  sarah saul scott sean sergio seth shane shannon shari sharon shaun shawn sheila shelby shelia
  shelley shelly sheri sherri sherry sheryl shirley sidney silvia simon sofia sonia sonya sophia
  spencer stacey stacy stan stanley stefanie stella stephanie stephen steve steven stuart sue
  summer susan susana susie suzanne sydney sylvia tabitha tamara tami tammy tanya tara tasha
  taylor ted teresa teri terrance terrence terri terry tessa thelma theodore theresa thomas tim
  timothy tina toby todd tom tomas tommy toni tony tonya tracey traci tracy travis trent trenton
  trevor trey tricia trisha troy tyler valerie vanessa velma vera vernon veronica vicki vickie
  vicky victor victoria vincent viola violet virginia vivian wade wallace walter wanda warren
  wayne wendy wesley whitney wilbur wilfredo will willard william willie willis wilma wilson
  yesenia yolanda yvette yvonne zachary zoe
  `
    .split(/\s+/)
    .filter(Boolean)
)

/**
 * The first name an address opens with, capitalised, or null where the
 * address does not open with one this list knows.
 *
 * The mailbox is split on the separators people put between the parts of a
 * name, and only its first part is read: maria.g@ is Maria, jsmith@ is nothing,
 * and danny2@ is nothing rather than Danny, since the digit says the name was
 * taken and the person settled for a variation, and greeting them by the name
 * alone is a guess about which of them this is.
 *
 * @param {string|null|undefined} email
 * @returns {string|null}
 */
export function firstNameOf(email) {
  const address = String(email ?? '')
    .trim()
    .toLowerCase()
  const at = address.indexOf('@')
  if (at <= 0) return null
  const first = address
    .slice(0, at)
    .split(/[._-]+/)
    .filter(Boolean)[0]
  if (!first || !FIRST_NAMES.has(first)) return null
  return first[0].toUpperCase() + first.slice(1)
}
