// Prices and pack sizes transcribed from the two Madikar Taila price sheets supplied for this store.
// Product copy is intentionally brief; the sheets do not specify ingredients or certifications.
const PRODUCTS = [];
const add = (category, name, packs, note, image = '') => {
  PRODUCTS.push({id: `p${PRODUCTS.length + 1}`, category, name,
    variants: packs.split('|').map(part => { const [size, price] = part.split(':'); return {size, price: Number(price)}; }),
    note, image});
};

// Oils
add('Oils','Groundnut Oil','500 ml:175|1 L:345|2 L:690|5 L:1725','A golden everyday cooking oil pressed from groundnuts.','assets/groundnut-oil.jpg');
add('Oils','Safflower Oil','500 ml:190|1 L:375|2 L:790|5 L:1850','A classic North Karnataka cooking oil, also known as kusubi oil.');
add('Oils','Coconut Oil','200 ml:110|500 ml:275|1 L:545','A versatile coconut oil for the kitchen and daily care.','assets/coconut-oil-supplied.png');
PRODUCTS.at(-1).imageAlt = 'Madikar Taila Coconut Oil bottles, front and back labels';
add('Oils','Black Sesame Oil','200 ml:170|500 ml:425|1 L:845','Richly aromatic oil pressed from black sesame seeds.');
add('Oils','Sesame Oil','1 L:595','Traditional sesame oil with a naturally nutty aroma.');
add('Oils','Mustard Oil','200 ml:90|500 ml:200|1 L:395','A bold, pungent oil for distinctive cooking.');
add('Oils','Sunflower Oil','500 ml:200|1 L:395|2 L:790|5 L:1975','A light everyday cooking oil pressed from sunflower seeds.');
add('Oils','Flaxseed Oil','1 L:645','Oil pressed from flaxseed, with a characteristic earthy taste.');
add('Oils','Niger / Huchellu Oil','1 L:645','A regional favourite pressed from niger seeds.');
add('Oils','Castor Oil','100 ml:40|200 ml:80','Castor oil for external care. Confirm intended use before purchase.');
add('Oils','Herbal Hair Oil','200 ml:245','A botanical hair oil for a simple care ritual.');
add('Oils','Pain Relief Oil','100 ml:145','A topical oil from the Madikar Taila care range.');
add('Oils','Almond Oil','100 ml:325|200 ml:650','Almond oil for everyday skin and hair care.');
add('Oils','Neem Oil','100 ml:60|200 ml:120','A strong, botanical oil for external care.');

// Natural pantry and specialities
add('Pantry','Honey','200 g:110|500 g:225|1 kg:445','A pantry staple for tea, breakfast and home cooking.');
add('Pantry','Turmeric Powder','100 g:50|200 g:100|400 g:200','Ground turmeric for colour and warmth in everyday cooking.');
add('Pantry','Byadagi Chilli Powder','1 kg:495','Deep red chilli powder named for Karnataka’s Byadagi region.');
add('Pantry','Jaggery','1 kg:70','Traditional cane jaggery for cooking and sweets.');
add('Pantry','Roasted Vermicelli','900 g:140','Roasted vermicelli, ready for savoury or sweet recipes.');
add('Pantry','Jaggery Powder','1 kg:125','Fine jaggery powder for easy measuring and mixing.');
add('Pantry','Liquid Jaggery','1 kg:120','Pourable jaggery for drinks, sweets and breakfast.');
add('Pantry','Cube Jaggery with Masala','500 g:60','Jaggery cubes with a warming masala blend.');
add('Pantry','Ragi Flour','1 kg:110','Finger millet flour for traditional rotis and porridge.');
add('Pantry','Chia Seeds','100 g:70','Small seeds for breakfast bowls, drinks and baking.');
add('Pantry','Sabja Seeds','100 g:45','Basil seeds traditionally soaked for cooling drinks.');
add('Pantry','Pumpkin Seeds','100 g:70','Pumpkin seeds for snacking and topping meals.');
add('Pantry','Himalayan Pink Salt','500 g:50|1 kg:100','Coarse pink salt for the pantry.');
add('Pantry','Gokarna Crystal Salt','1 kg:25','Crystal salt listed as sourced from Gokarna.');
add('Pantry','Jave Wheat Millet Vermicelli','450 g:80','A vermicelli option for breakfast and desserts.');
add('Pantry','Wheat Vermicelli','450 g:65','Traditional wheat vermicelli for a quick meal.');
add('Pantry','Navani Millet Vermicelli','450 g:90','Foxtail millet vermicelli for familiar recipes.');
add('Pantry','Ragi Millet Vermicelli','450 g:80','Finger millet vermicelli for savoury or sweet dishes.');
add('Pantry','Dry Fruit Cookies','Pack:145','Home-made style cookies with dry fruit. Pack weight to be confirmed.');
add('Pantry','Ragi Cookies','Pack:125','Home-made style finger millet cookies. Pack weight to be confirmed.');
add('Pantry','Oats Cookies','Pack:125','Home-made style oat cookies. Pack weight to be confirmed.');
add('Pantry','Jave Godi','1 kg:100','A traditional wheat grain for everyday cooking.');
add('Pantry','Jave Godi Rava','1 kg:165','Broken jave wheat for upma and other savoury dishes.');

// Millets
add('Millets','Navani Millet','500 g:40|1 kg:80','Foxtail millet, a traditional grain for pulao and porridge.');
add('Millets','Baragu Millet','500 g:70|1 kg:130','Proso millet for a variety of everyday recipes.');
add('Millets','Saame Millet','500 g:80|1 kg:160','Little millet with a delicate texture.');
add('Millets','Araka Millet','500 g:60|1 kg:110','Kodo millet for warm bowls and savoury meals.');
add('Millets','Korale Millet','500 g:135|1 kg:265','Browntop millet for wholesome home cooking.');
add('Millets','Udalu Millet','500 g:75|1 kg:145','Barnyard millet for light, versatile meals.');

// Chutney powders and spice blends
add('Chutneys & Spices','Shenga Chutney','200 g:60','Groundnut chutney powder for the North Karnataka table.','assets/shenga-chutney.jpg');
add('Chutneys & Spices','Putane Chutney','200 g:75','Roasted gram chutney powder for meals and snacks.');
add('Chutneys & Spices','Gural Chutney','200 g:80','Traditional niger seed chutney powder.');
add('Chutneys & Spices','Agasi Chutney','200 g:75','Flaxseed chutney powder with a nutty character.');
add('Chutneys & Spices','Methi Hittu','200 g:75','A traditional spiced flour mix.');
add('Chutneys & Spices','Garlic Chutney','200 g:80','A bold garlic chutney powder.');
add('Chutneys & Spices','Sambar Powder','100 g:80','A warming spice blend for sambar.');
add('Chutneys & Spices','Puliogere Powder','100 g:55','Tangy spice mix for puliogere rice.');
add('Chutneys & Spices','Garam Masala','100 g:80','A fragrant spice blend for everyday cooking.');
add('Chutneys & Spices','Rasam Powder','100 g:80','A comforting spice blend for rasam.');

// Pickles, ghee and beverages
add('Pickles','Mango Pickle','200 g:125','A classic mango pickle for the everyday table.');
add('Pickles','Vinay Mango Pickle','200 g:125|500 g:250','A traditional mango pickle for meals.');
add('Pickles','Tender Mango Pickle','300 g:130','Pickled tender mangoes with a bright tang.');
add('Pickles','Lemon Pickle','300 g:65','Tangy lemon pickle to serve alongside meals.');
add('Pickles','Sweet Lemon Pickle','300 g:65','A sweet and tart lemon pickle.');
add('Pickles','Mix Pickle','300 g:65','A mixed pickle for the everyday table.');
add('Ghee','Malnad Ghee','200 ml:325|500 ml:750','Golden ghee from the Malnad range.');
add('Drinks','Kokum Kadi','Bottle:140','A kokum drink with a bright, tart taste. Bottle volume to be confirmed.');
add('Drinks','Hot Kokum','Bottle:120','A spiced kokum drink. Bottle volume to be confirmed.');
add('Drinks','Kokum Syrup','Bottle:160','Kokum syrup to dilute into a refreshing drink. Bottle volume to be confirmed.');
add('Drinks','Amla Juice','Bottle:150','Amla juice from the natural drinks range. Bottle volume to be confirmed.');
add('Drinks','Lemon Ginger','Bottle:150','A lemon and ginger drink. Bottle volume to be confirmed.');
add('Drinks','Blue Berry','Bottle:160','A berry drink from the natural range. Bottle volume to be confirmed.');

// Teas and body care
add('Teas','Spice Tea Kashaya','Pack:200','A warming spice tea blend. Pack weight to be confirmed.');
add('Teas','Amala Kashaya','Pack:200','An amla-based kashaya blend. Pack weight to be confirmed.');
add('Teas','Ashwagandha Kashaya','Pack:200','An ashwagandha kashaya blend. Pack weight to be confirmed.');
add('Teas','Moringa Kashaya','Pack:200','A moringa kashaya blend. Pack weight to be confirmed.');
add('Personal Care','Rose Soap','Bar:60','A rose-scented bath bar. Bar weight to be confirmed.');
add('Personal Care','Chandan Soap','Bar:60','A sandalwood-scented bath bar. Bar weight to be confirmed.');
add('Personal Care','Panchagavya Soap','Bar:60','A traditional Panchagavya bath bar. Bar weight to be confirmed.');
add('Personal Care','Panchatava Soap','Pack of 4:125','A four-bar soap pack; scent details to be confirmed.');
add('Personal Care','Neem Soap','Pack of 3:90','A three-bar neem soap pack.');
add('Personal Care','Orange Soap','Pack of 3:90','A three-bar orange soap pack.');
add('Personal Care','Trio Handmade Soap','Set:90','A handmade soap set listed with coffee, neem, turmeric and rose; contents to be confirmed.');
add('Personal Care','Charcoal Tooth Powder','Pack:100','Charcoal tooth powder. Pack weight to be confirmed.');
add('Personal Care','Red Tooth Powder','Pack:150','A red tooth powder. Pack weight to be confirmed.');
add('Personal Care','Siddhadanta Tooth Paste','Tube:65','Tooth paste from the Madikar Taila care range. Tube size to be confirmed.');
add('Personal Care','Rose Face Pack','Pack:200','A rose face pack. Pack weight to be confirmed.');
add('Personal Care','Charcoal Face Pack','Pack:150','A charcoal face pack. Pack weight to be confirmed.');
add('Personal Care','Agnihotra Dhoop Sticks','Box:45','Dhoop sticks for home fragrance. Box quantity to be confirmed.');
add('Garden','Vermicompost','2 kg:100','Natural compost for garden and potted plants.');

// Editorial illustrations are used while individual pack photographs are unavailable.
// Keep this mapping explicit so every product has a relevant local image.
const imageGroups = {
  'oil-pressed': ['Groundnut Oil','Mustard Oil','Flaxseed Oil','Niger / Huchellu Oil'],
  'safflower-oil': ['Safflower Oil','Sunflower Oil'],
  'coconut-oil': ['Coconut Oil'],
  'sesame-oil': ['Black Sesame Oil','Sesame Oil'],
  'care-oil': ['Castor Oil','Herbal Hair Oil','Pain Relief Oil','Almond Oil','Neem Oil'],
  'pantry-honey': ['Honey'],
  'spice-powder': ['Turmeric Powder'],
  'chilli-powder': ['Byadagi Chilli Powder'],
  'jaggery': ['Jaggery','Jaggery Powder','Liquid Jaggery','Cube Jaggery with Masala'],
  'vermicelli': ['Roasted Vermicelli','Jave Wheat Millet Vermicelli','Wheat Vermicelli','Navani Millet Vermicelli','Ragi Millet Vermicelli'],
  'ragi-flour': ['Ragi Flour','Jave Godi Rava'],
  'seeds': ['Chia Seeds','Sabja Seeds','Pumpkin Seeds'],
  'salt': ['Himalayan Pink Salt','Gokarna Crystal Salt'],
  'cookies': ['Dry Fruit Cookies','Ragi Cookies','Oats Cookies'],
  'millet-grains': ['Jave Godi','Navani Millet','Baragu Millet','Saame Millet','Araka Millet','Korale Millet','Udalu Millet'],
  'chutney': ['Shenga Chutney','Putane Chutney','Gural Chutney','Agasi Chutney','Methi Hittu','Garlic Chutney','Sambar Powder','Puliogere Powder','Garam Masala','Rasam Powder'],
  'pickle': ['Mango Pickle','Vinay Mango Pickle','Tender Mango Pickle','Lemon Pickle','Sweet Lemon Pickle','Mix Pickle'],
  'ghee': ['Malnad Ghee'],
  'drinks': ['Kokum Kadi','Hot Kokum','Kokum Syrup','Amla Juice','Lemon Ginger','Blue Berry'],
  'tea': ['Spice Tea Kashaya','Amala Kashaya','Ashwagandha Kashaya','Moringa Kashaya'],
  'soap': ['Rose Soap','Chandan Soap','Panchagavya Soap','Panchatava Soap','Neem Soap','Orange Soap','Trio Handmade Soap'],
  'dental': ['Charcoal Tooth Powder','Red Tooth Powder','Siddhadanta Tooth Paste'],
  'skincare': ['Rose Face Pack','Charcoal Face Pack'],
  'incense': ['Agnihotra Dhoop Sticks'],
  'compost': ['Vermicompost']
};
const imageByName = new Map(Object.entries(imageGroups).flatMap(([image,names]) => names.map(name => [name, `assets/${image}.webp`])));
for (const product of PRODUCTS) product.image = product.image || imageByName.get(product.name) || '';

window.PRODUCTS = PRODUCTS;
