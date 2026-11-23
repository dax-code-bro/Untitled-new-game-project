// The phone's rules (systems/phone.js, phoneplus.js).
using System.Collections.Generic;
using System.Linq;
using NUnit.Framework;
using Southbound.Core;

namespace Southbound.Tests
{
    public class PhoneTests
    {
        [Test]
        public void Texts_and_news_are_kept_newest_first()
        {
            var p = Profile.New(); p.Day = 4; p.Hour = 13.5;
            for (int i = 0; i < 45; i++) PhoneBook.Text(p, "Lupe", "message " + i);
            Assert.That(p.List("texts").Count, Is.EqualTo(40), "the newest 40");
            Assert.That(((Dictionary<string, object>)p.List("texts")[0]).Text("body"), Is.EqualTo("message 44"));
            Assert.That(PhoneBook.Unread(p), Is.EqualTo(40));
            PhoneBook.ReadAll(p);
            Assert.That(PhoneBook.Unread(p), Is.EqualTo(0));
            PhoneBook.News(p, PhoneBook.CrimeStory("poaching", "Redgrass Plains"));
            var q = Profile.FromJson(p.ToJson());
            Assert.That(((Dictionary<string, object>)q.List("news")[0]).Text("text"), Is.EqualTo("Game wardens report a poached animal in Redgrass Plains."));
            Assert.That(q.List("texts").Count, Is.EqualTo(40)); Assert.That(PhoneBook.Unread(q), Is.EqualTo(0));
            Assert.That(PhoneBook.CrimeStory("speeding", "x"), Is.Null, "not everything makes the paper");
        }

        [Test]
        public void Cabs_the_bank_and_the_clock()
        {
            Assert.That(PhoneBook.Cab(1609), Is.EqualTo((7, 1.0)), "$4 + $2.60 a mile, rounded");
            Assert.That(PhoneBook.Cab(0).fare, Is.EqualTo(4));
            Assert.That(PhoneBook.CabHours(2), Is.EqualTo(0.17).Within(1e-12));
            Assert.That(PhoneBook.Interest(10000), Is.EqualTo(50)); Assert.That(PhoneBook.Interest(80), Is.EqualTo(0)); Assert.That(PhoneBook.Interest(-5), Is.EqualTo(0));
            Assert.That(PhoneBook.Clock(0.5), Is.EqualTo("12:30 am")); Assert.That(PhoneBook.Clock(13.25), Is.EqualTo("1:15 pm"));
            Assert.That(PhoneBook.WeatherWord("storm"), Is.EqualTo("Thunderstorms")); Assert.That(PhoneBook.WeatherAdvice("rain"), Is.EqualTo("Roads will be slick."));
            Assert.That(PhoneBook.Filler.Length, Is.EqualTo(10));
        }
    }
}
